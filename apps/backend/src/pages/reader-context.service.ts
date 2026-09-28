import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type FormDefinition, type Row, type RowFormLink } from '@strategos/shared';
import { isConfigured } from '../forms/form-definition.js';
import { AppException } from '../common/app-exception.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EMPTY_CELL } from '../sources/cell-format.js';
import { needKey, SourceDataService } from '../sources/source-data.service.js';
import { collectReferences, type FormInfo, type ReaderContext } from './assembler.js';
import { PageAccessService, type PageReader, readerOf } from './page-access.service.js';

/** Adresses d'un formulaire : en aperçu, le brouillon, et pas d'envoi possible. */
export function formLinks(formId: string, preview: boolean) {
  return preview
    ? { formUrl: `/api/v1/admin/forms/${formId}/preview`, submitUrl: null }
    : { formUrl: `/api/v1/forms/${formId}`, submitUrl: `/api/v1/forms/${formId}/submissions` };
}

/** Contexte prêt pour l'assemblage, et sources injoignables à signaler à l'admin. */
export interface PreparedContext extends ReaderContext {
  unavailableSources: { id: string; name: string }[];
}

interface Options {
  /** Lecture des pages : lecteur résolu par ses droits, ou admin voyant aussi les brouillons. */
  reader: PageReader | { draftsToo: true };
  personalPageId: string | null;
  /** Liste les sources injoignables (admin seul, 13 — Page assemblée). */
  revealSources: boolean;
  /** Aperçu : les lignes se lisent dans le brouillon, par la route admin. */
  preview: boolean;
}

/** Prépare en une fois ce que l'assemblage doit savoir des pages, médias et données cités. */
@Injectable()
export class ReaderContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PageAccessService,
    private readonly data: SourceDataService,
  ) {}

  /** Lecteur réel : ses droits et sa page personnelle. */
  forUser(user: User, rows: Row[]): Promise<PreparedContext> {
    return this.prepare(rows, {
      reader: readerOf(user),
      personalPageId: user.personalPageId,
      revealSources: user.isAdmin,
      preview: false,
    });
  }

  /**
   * Contexte d'un aperçu : vue administrateur complète, ou vue d'un membre du
   * seul groupe `asGroup` ; un groupe inconnu ou supprimé → `404`.
   */
  async forPreview(
    admin: User,
    asGroup: string | undefined,
    rows: Row[],
  ): Promise<PreparedContext> {
    if (!asGroup) return this.forAdmin(admin, rows);
    if (!(await this.prisma.group.count({ where: { id: asGroup, deletedAt: null } }))) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
    }
    return this.forGroup(asGroup, rows);
  }

  /**
   * Aperçu avec les droits d'un groupe (06) : un membre fictif de ce seul groupe,
   * sans page personnelle. Même calcul que pour un lecteur réel.
   */
  forGroup(groupId: string, rows: Row[]): Promise<PreparedContext> {
    return this.prepare(rows, {
      reader: { groupId },
      personalPageId: null,
      revealSources: true,
      preview: true,
    });
  }

  /**
   * Aperçu administrateur : tout est visible, pages non publiées comprises ;
   * « Ma page personnelle » est celle de l'admin.
   */
  forAdmin(admin: User, rows: Row[]): Promise<PreparedContext> {
    return this.prepare(rows, {
      reader: { draftsToo: true },
      personalPageId: admin.personalPageId,
      revealSources: true,
      preview: true,
    });
  }

  private async prepare(rows: Row[], options: Options): Promise<PreparedContext> {
    const refs = collectReferences(rows);
    if (options.personalPageId) refs.pageIds.add(options.personalPageId);
    const [readable, media, values, sources, forms] = await Promise.all([
      'draftsToo' in options.reader
        ? this.existingPages(refs.pageIds)
        : this.access.readablePageIds(options.reader, refs.pageIds),
      this.existingMedia(refs.mediaIds),
      this.data.readCells(refs.cells),
      this.data.describe([...refs.sourceIds]),
      this.forms(refs.forms, options.preview),
    ]);
    const available = (id: string) =>
      (sources.get(id)?.available ?? false) && !values.unavailable.has(id);
    const unavailableSources = options.revealSources
      ? [...refs.sourceIds]
          .filter((id) => !available(id))
          .map((id) => ({ id, name: sources.get(id)?.name ?? '' }))
      : [];
    return {
      personalPageId: options.personalPageId,
      canReadPage: (id) => readable.has(id),
      mediaExists: (id) => media.has(id),
      cell: (need) => values.cells.get(needKey(need)) ?? EMPTY_CELL,
      sourceAvailable: available,
      rowsUrl: (blockId) =>
        options.preview
          ? `/api/v1/admin/blocks/${blockId}/rows?preview=true`
          : `/api/v1/blocks/${blockId}/rows`,
      form: (formId) => forms.info.get(formId) ?? null,
      rowForms: (blockId) => forms.rowForms.get(blockId) ?? [],
      formLinks: (formId) => formLinks(formId, options.preview),
      unavailableSources,
    };
  }

  /**
   * Formulaires des blocs `form` : version publiée, ou brouillon en aperçu.
   * Les formulaires de ligne configurés sont rattachés au bloc qu'ils relient.
   */
  private async forms(
    blocks: Map<string, string>,
    preview: boolean,
  ): Promise<{ info: Map<string, FormInfo>; rowForms: Map<string, RowFormLink[]> }> {
    const info = new Map<string, FormInfo>();
    const rowForms = new Map<string, RowFormLink[]>();
    if (blocks.size === 0) return { info, rowForms };
    const forms = await this.prisma.form.findMany({
      where: { id: { in: [...blocks.keys()] }, deletedAt: null },
      include: { published: true },
    });
    for (const form of forms) {
      const def = (preview ? form.draftDefinition : form.published?.definition) as
        FormDefinition | undefined;
      const configured = !!def && isConfigured(form.mode, def);
      info.set(form.id, { blockId: form.blockId, mode: form.mode, configured });
      if (configured && form.mode === 'ligne' && blocks.get(form.id) === form.blockId) {
        const linked = def!.linkedBlockId!;
        rowForms.set(linked, [
          ...(rowForms.get(linked) ?? []),
          { formId: form.id, title: def!.title, ...formLinks(form.id, preview) },
        ]);
      }
    }
    return { info, rowForms };
  }

  private async existingPages(ids: Set<string>): Promise<Set<string>> {
    const pages = await this.prisma.page.findMany({
      where: { id: { in: [...ids] }, deletedAt: null },
      select: { id: true },
    });
    return new Set(pages.map((p) => p.id));
  }

  private async existingMedia(ids: Set<string>): Promise<Set<string>> {
    if (ids.size === 0) return new Set();
    const rows = await this.prisma.media.findMany({
      where: { id: { in: [...ids] }, deletedAt: null },
      select: { id: true },
    });
    return new Set(rows.map((m) => m.id));
  }
}
