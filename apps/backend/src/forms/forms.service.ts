import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AdminForm,
  AuditAction,
  AuditTargetType,
  emptyFormDefinition,
  ErrorCode,
  type FormDefinition,
  type FormMode,
  type PageConfig,
  type Row,
  type SaveFormDraftResult,
  SubmissionStatus,
  type Warning,
} from '@strategos/shared';
import { FormDefinitionSchema } from '@strategos/shared/validation';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { AuditActor } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/app-exception.js';
import { toFieldErrors } from '../common/validation.pipe.js';
import type { Form, FormVersion, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Db } from '../prisma/prisma.types.js';
import { sheetsOf } from '../sources/sources.service.js';
import { FormDataService, pageBlocks } from './form-data.service.js';
import { definitionErrors, isConfigured, structuralChange } from './form-definition.js';
import type { CreateFormDto, FormSettingsDto, SaveFormDraftDto } from './forms.dto.js';

export type FormWithVersion = Form & { published: FormVersion | null };

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);

export const draftOf = (form: Form) => form.draftDefinition as unknown as FormDefinition;
export const publishedOf = (form: FormWithVersion) =>
  form.published ? (form.published.definition as unknown as FormDefinition) : null;

export function toAdminForm(form: FormWithVersion): AdminForm {
  const draft = draftOf(form);
  return {
    id: form.id,
    pageId: form.pageId,
    blockId: form.blockId,
    mode: form.mode,
    draft,
    published: publishedOf(form),
    publishedVersion: form.publishedVersion,
    isOpen: form.isOpen,
    closesAt: form.closesAt?.toISOString() ?? null,
    autoValidate: form.autoValidate,
    configured: isConfigured(form.mode, draft),
    version: form.version,
  };
}

/** État d'un formulaire au journal : résumé lisible. */
function auditState(form: Form) {
  const def = draftOf(form);
  return { title: def.title, mode: form.mode, fields: def.fields.map((f) => f.key) };
}

/** Retire de zones le bloc `blockId` ; renvoie `null` s'il n'y était pas. */
function withoutBlock(rows: Row[] | null, blockId: string): Row[] | null {
  return (
    rows?.map((row) => ({
      ...row,
      columns: row.columns.map((c) => (c.block?.id === blockId ? { ...c, block: null } : c)),
    })) ?? null
  );
}

/**
 * Formulaires côté admin (09, 13 — Formulaires et soumissions). La définition
 * suit le brouillon de la page ; ouvrir, fermer, la date limite et la
 * validation automatique sont immédiats.
 */
@Injectable()
export class FormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly formData: FormDataService,
  ) {}

  async getIn(db: Db, id: string): Promise<FormWithVersion> {
    const form = await db.form.findFirst({
      where: { id, deletedAt: null },
      include: { published: true },
    });
    if (!form) throw notFound();
    return form;
  }

  async get(id: string): Promise<AdminForm> {
    return toAdminForm(await this.getIn(this.prisma, id));
  }

  /** Formulaire rattaché à un bloc du brouillon d'une page, avec une définition vide. */
  async create(dto: CreateFormDto, actor: AuditActor): Promise<AdminForm> {
    if (!(await this.prisma.page.count({ where: { id: dto.pageId, deletedAt: null } }))) {
      throw notFound();
    }
    if (await this.prisma.form.count({ where: { blockId: dto.pageBlockId } })) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, {
        fields: { pageBlockId: ['duplicateId'] },
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          pageId: dto.pageId,
          blockId: dto.pageBlockId,
          mode: dto.mode,
          draftDefinition: emptyFormDefinition(dto.mode) as unknown as Prisma.InputJsonValue,
        },
        include: { published: true },
      });
      await this.audit.record(tx, actor, {
        action: AuditAction.FORM_CREATE,
        targetType: AuditTargetType.FORM,
        targetId: form.id,
        after: { ...auditState(form), pageId: form.pageId },
      });
      return toAdminForm(form);
    });
  }

  /**
   * Brouillon de la définition. Rien ne change pour les utilisateurs avant la
   * publication de la page ; la réponse dit ce que la publication invaliderait.
   */
  async saveDraft(
    id: string,
    dto: SaveFormDraftDto,
    actor: AuditActor,
  ): Promise<SaveFormDraftResult> {
    const current = await this.getIn(this.prisma, id);
    const definition = await this.validateDefinition(current, dto.definition);
    const form = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.form.updateMany({
        where: { id, deletedAt: null, version: dto.version },
        data: {
          draftDefinition: definition as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      if (count === 0) throw new AppException(HttpStatus.CONFLICT, ErrorCode.EDIT_CONFLICT);
      const after = await this.getIn(tx, id);
      await this.audit.record(tx, actor, {
        action: AuditAction.FORM_UPDATE,
        targetType: AuditTargetType.FORM,
        targetId: id,
        before: auditState(current),
        after: auditState(after),
      });
      return after;
    });
    return {
      form: toAdminForm(form),
      warnings: await this.warnings(form.mode, definition),
      wouldInvalidate: await this.wouldInvalidate(form),
    };
  }

  /** Avertissements non bloquants : cellule-formule ciblée, zone d'ajout non couverte. */
  async warnings(mode: FormMode, def: FormDefinition): Promise<Warning[]> {
    const warnings = this.formData.formulaWarning(await this.formData.formulaTargets(mode, def));
    if (mode === 'ajout' && def.sourceId) {
      warnings.push(
        ...(await this.formData.zoneCoverageWarnings(
          [{ title: def.title, def }],
          await this.formData.pagesUsingSource(def.sourceId),
        )),
      );
    }
    return warnings;
  }

  /** Soumissions en attente que la publication du brouillon invaliderait. */
  async wouldInvalidate(form: FormWithVersion): Promise<number> {
    const published = publishedOf(form);
    if (!published || !structuralChange(published, draftOf(form))) return 0;
    return this.prisma.submission.count({
      where: { formId: form.id, status: SubmissionStatus.pending },
    });
  }

  /**
   * Suppression : le bloc est retiré du brouillon de la page, et le formulaire
   * disparaît à la publication. Jamais publié, il est supprimé tout de suite.
   */
  async remove(id: string, actor: AuditActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const form = await this.getIn(tx, id);
      const page = await tx.page.findFirst({ where: { id: form.pageId, deletedAt: null } });
      if (page) {
        const draft = page.draftConfig as unknown as PageConfig;
        if (pageBlocks(draft).some((b) => b.id === form.blockId)) {
          const config: PageConfig = {
            ...draft,
            zones: {
              main: withoutBlock(draft.zones.main, form.blockId),
              sidebar: withoutBlock(draft.zones.sidebar, form.blockId),
            },
          };
          await tx.page.update({
            where: { id: page.id },
            data: {
              draftConfig: config as unknown as Prisma.InputJsonValue,
              version: { increment: 1 },
            },
          });
          await this.audit.record(tx, actor, {
            action: AuditAction.PAGE_UPDATE,
            targetType: AuditTargetType.PAGE,
            targetId: page.id,
            before: { name: page.name, formBlock: form.blockId },
            after: { name: page.name, formBlock: null },
          });
        }
      }
      if (form.publishedVersion === null) {
        await tx.form.update({
          where: { id },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        await this.audit.record(tx, actor, {
          action: AuditAction.FORM_DELETE,
          targetType: AuditTargetType.FORM,
          targetId: id,
          before: { ...auditState(form), deleted: false },
          after: { ...auditState(form), deleted: true },
        });
      }
    });
  }

  /** Ouvrir ou fermer (immédiat) ; les soumissions en attente restent validables. */
  async setOpen(id: string, isOpen: boolean, actor: AuditActor): Promise<AdminForm> {
    return this.updateSettings(id, { isOpen }, actor);
  }

  /**
   * Date limite et validation automatique (immédiat). Activer la validation
   * automatique sur un formulaire qui vise des cellules-formules demande une
   * confirmation : il n'y aura pas de validation manuelle pour avertir.
   */
  async settings(id: string, dto: FormSettingsDto, actor: AuditActor): Promise<AdminForm> {
    const form = await this.getIn(this.prisma, id);
    if (dto.autoValidate && !form.autoValidate && !dto.confirm) {
      const def = publishedOf(form) ?? draftOf(form);
      const warnings = this.formData.formulaWarning(
        await this.formData.formulaTargets(form.mode, def),
      );
      if (warnings.length > 0) {
        throw new AppException(HttpStatus.CONFLICT, ErrorCode.CONFIRMATION_REQUIRED, { warnings });
      }
    }
    return this.updateSettings(
      id,
      {
        ...(dto.closesAt !== undefined
          ? { closesAt: dto.closesAt === null ? null : new Date(dto.closesAt) }
          : {}),
        ...(dto.autoValidate !== undefined ? { autoValidate: dto.autoValidate } : {}),
      },
      actor,
    );
  }

  private async updateSettings(
    id: string,
    data: { isOpen?: boolean; closesAt?: Date | null; autoValidate?: boolean },
    actor: AuditActor,
  ): Promise<AdminForm> {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.getIn(tx, id);
      const after = await tx.form.update({ where: { id }, data, include: { published: true } });
      const state = (f: Form) => ({
        title: draftOf(f).title,
        isOpen: f.isOpen,
        closesAt: f.closesAt?.toISOString() ?? null,
        autoValidate: f.autoValidate,
      });
      await this.audit.record(tx, actor, {
        action: AuditAction.FORM_SETTINGS,
        targetType: AuditTargetType.FORM,
        targetId: id,
        before: state(before),
        after: state(after),
      });
      return toAdminForm(after);
    });
  }

  /**
   * Formulaires cités par les blocs `form` d'un brouillon de page : ils doivent
   * exister, appartenir à la page et à ce bloc (`VALIDATION_FAILED` sinon).
   */
  async checkFormBlocks(pageId: string, config: PageConfig, prefix: string): Promise<void> {
    const fields: Record<string, string[]> = {};
    const blocks: { path: string; blockId: string; formId: string }[] = [];
    for (const zone of ['main', 'sidebar'] as const) {
      (config.zones[zone] ?? []).forEach((row, i) =>
        row.columns.forEach((column, j) => {
          if (column.block?.type === 'form') {
            blocks.push({
              path: `${prefix}.${zone}[${i}].columns[${j}].block.config.formId`,
              blockId: column.block.id,
              formId: column.block.config.formId,
            });
          }
        }),
      );
    }
    if (blocks.length === 0) return;
    const forms = await this.prisma.form.findMany({
      where: { id: { in: blocks.map((b) => b.formId) }, deletedAt: null },
    });
    for (const b of blocks) {
      const form = forms.find((f) => f.id === b.formId);
      if (!form || form.pageId !== pageId || form.blockId !== b.blockId)
        fields[b.path] = ['notFound'];
    }
    if (Object.keys(fields).length > 0) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, { fields });
    }
  }

  /**
   * Forme (schéma partagé), cohérence (clés, mode) et références (source,
   * feuille, Tableau ou Catalogue relié). Un mapping incomplet est accepté.
   */
  private async validateDefinition(form: Form, raw: unknown): Promise<FormDefinition> {
    const instance = plainToInstance(FormDefinitionSchema, raw);
    const errors = validateSync(instance as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const fields = toFieldErrors(errors, 'definition');
    if (typeof raw !== 'object' || raw === null) fields.definition = ['isObject'];
    if (Object.keys(fields).length > 0) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, { fields });
    }
    const def = JSON.parse(JSON.stringify(instance)) as FormDefinition;
    def.sourceId ??= null;
    def.sheet ??= null;
    Object.assign(fields, definitionErrors(form.mode, def));

    const sourceIds = [
      ...new Set([
        ...(def.sourceId ? [def.sourceId] : []),
        ...def.fields.flatMap((f) => (f.options?.sourceId ? [f.options.sourceId] : [])),
      ]),
    ];
    const sources = await this.prisma.source.findMany({
      where: { id: { in: sourceIds }, deletedAt: null },
    });
    const checkSheet = (path: string, sourceId: string, sheet: string | null | undefined) => {
      const source = sources.find((s) => s.id === sourceId);
      if (!source) fields[`${path}.sourceId`] = ['sourceNotFound'];
      else if (sheet && !sheetsOf(source).includes(sheet))
        fields[`${path}.sheet`] = ['sheetNotFound'];
    };
    if (def.sourceId) checkSheet('definition', def.sourceId, def.sheet);
    def.fields.forEach((f, i) => {
      if (f.options?.kind === 'range' && f.options.sourceId) {
        checkSheet(`definition.fields[${i}].options`, f.options.sourceId, f.options.sheet);
      }
    });

    if (form.mode === 'ligne' && def.linkedBlockId) {
      const page = await this.prisma.page.findUnique({ where: { id: form.pageId } });
      const linked = pageBlocks(page?.draftConfig as unknown as PageConfig).find(
        (b) => b.id === def.linkedBlockId,
      );
      const sameSource =
        (linked?.type === 'table' || linked?.type === 'catalog') &&
        linked.config.sourceId === def.sourceId &&
        linked.config.sheet === def.sheet;
      if (!sameSource) fields['definition.linkedBlockId'] = ['notFound'];
    }
    if (Object.keys(fields).length > 0) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, { fields });
    }
    return def;
  }
}
