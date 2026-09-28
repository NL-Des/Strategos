import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditTargetType,
  ErrorCode,
  type PageConfig,
  type PublishPreview,
  SubmissionStatus,
  WarningCode,
} from '@strategos/shared';
import type { AuditActor } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/app-exception.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import type { Db } from '../prisma/prisma.types.js';
import { FormDataService, pageBlocks } from './form-data.service.js';
import { structuralChange } from './form-definition.js';
import { draftOf, type FormWithVersion, publishedOf } from './forms.service.js';

type Change = PublishPreview['forms'][number]['change'];

interface FormChange {
  form: FormWithVersion;
  change: Change;
  /** Soumissions en attente que ce changement invalide. */
  pending: string[];
}

/**
 * Formulaires d'une page à la publication (06 — Brouillon et publication, 09) :
 * leur définition suit le brouillon de la page et ne prend effet qu'à sa
 * publication, qui invalide les soumissions en attente si la modification est
 * structurelle ou si le formulaire est retiré.
 */
@Injectable()
export class PageFormsService {
  constructor(
    private readonly audit: AuditService,
    private readonly formData: FormDataService,
  ) {}

  /** Ce que publier `draft` changerait aux formulaires de la page. */
  async changes(db: Db, pageId: string, draft: PageConfig): Promise<FormChange[]> {
    const forms = await db.form.findMany({
      where: { pageId, deletedAt: null },
      include: { published: true },
    });
    const blocks = pageBlocks(draft);
    const changes: FormChange[] = [];
    for (const form of forms) {
      const inDraft = blocks.some(
        (b) => b.type === 'form' && b.id === form.blockId && b.config.formId === form.id,
      );
      const published = publishedOf(form);
      let change: Change | null = null;
      if (inDraft && !published) change = 'created';
      else if (inDraft && JSON.stringify(published) !== JSON.stringify(draftOf(form))) {
        change = structuralChange(published!, draftOf(form)) ? 'structural' : 'updated';
      } else if (!inDraft && published) change = 'deleted';
      if (!change) continue;
      const pending =
        change === 'structural' || change === 'deleted'
          ? (
              await db.submission.findMany({
                where: { formId: form.id, status: SubmissionStatus.pending },
                select: { id: true },
              })
            ).map((s) => s.id)
          : [];
      changes.push({ form, change, pending });
    }
    return changes;
  }

  async preview(db: Db, pageId: string, draft: PageConfig): Promise<PublishPreview> {
    const changes = await this.changes(db, pageId, draft);
    return {
      forms: changes.map(({ form, change }) => ({
        id: form.id,
        title: (change === 'deleted' ? publishedOf(form)! : draftOf(form)).title,
        change,
      })),
      invalidatedSubmissions: changes.reduce((n, c) => n + c.pending.length, 0),
    };
  }

  /**
   * Publie les formulaires de la page dans la transaction de sa publication :
   * nouvelle version, invalidation des soumissions en attente (confirmation
   * requise si elles existent), suppression des formulaires retirés.
   */
  async publish(
    tx: Prisma.TransactionClient,
    pageId: string,
    draft: PageConfig,
    admin: User,
    actor: AuditActor,
    confirm: boolean,
  ): Promise<void> {
    const changes = await this.changes(tx, pageId, draft);
    const invalidated = changes.reduce((n, c) => n + c.pending.length, 0);
    if (invalidated > 0 && !confirm) {
      throw new AppException(HttpStatus.CONFLICT, ErrorCode.CONFIRMATION_REQUIRED, {
        warnings: [
          {
            code: WarningCode.SUBMISSIONS_INVALIDATED,
            message: 'La publication invalidera des soumissions en attente.',
            count: invalidated,
          },
        ],
      });
    }
    const now = new Date();
    for (const { form, change, pending } of changes) {
      if (change === 'deleted') {
        await tx.form.update({ where: { id: form.id }, data: { deletedAt: now } });
        await this.audit.record(tx, actor, {
          action: AuditAction.FORM_DELETE,
          targetType: AuditTargetType.FORM,
          targetId: form.id,
          before: { title: publishedOf(form)!.title, deleted: false },
          after: { title: publishedOf(form)!.title, deleted: true },
        });
      } else {
        const version = (form.publishedVersion ?? 0) + 1;
        await tx.formVersion.create({
          data: {
            formId: form.id,
            version,
            definition: form.draftDefinition as Prisma.InputJsonValue,
            publishedBy: admin.id,
          },
        });
        await tx.form.update({ where: { id: form.id }, data: { publishedVersion: version } });
        await this.audit.record(tx, actor, {
          action: AuditAction.FORM_PUBLISH,
          targetType: AuditTargetType.FORM,
          targetId: form.id,
          before: { version: form.publishedVersion },
          after: { version, title: draftOf(form).title, change },
        });
      }
      if (pending.length > 0) {
        const reason = change === 'deleted' ? 'form_deleted' : 'form_changed';
        await tx.submission.updateMany({
          where: { id: { in: pending }, status: SubmissionStatus.pending },
          data: { status: SubmissionStatus.invalidated, reason, decidedAt: now },
        });
        await this.audit.record(tx, actor, {
          action: AuditAction.SUBMISSION_INVALIDATE,
          targetType: AuditTargetType.FORM,
          targetId: form.id,
          after: { reason, submissions: pending },
        });
      }
    }
  }

  /**
   * Avertissements d'un brouillon de page : Tableau ou Catalogue à plage fixe
   * qui ne couvre pas la zone d'un formulaire d'ajout de la même source.
   */
  async draftWarnings(db: Db, page: { id: string; name: string }, draft: PageConfig) {
    const tables = pageBlocks(draft).filter(
      (b) => (b.type === 'table' || b.type === 'catalog') && b.config.range.mode === 'fixed',
    );
    if (tables.length === 0) return [];
    const sources = tables.map((b) =>
      b.type === 'table' || b.type === 'catalog' ? b.config.sourceId : '',
    );
    const forms = await db.form.findMany({
      where: { deletedAt: null, mode: 'ajout' },
      include: { published: true },
    });
    const relevant = forms
      .map((f) => publishedOf(f) ?? draftOf(f))
      .filter((def) => def.sourceId && sources.includes(def.sourceId))
      .map((def) => ({ title: def.title, def }));
    return this.formData.zoneCoverageWarnings(relevant, [{ ...page, config: draft }]);
  }
}
