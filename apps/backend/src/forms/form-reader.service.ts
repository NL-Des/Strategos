import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type FormDefinition,
  type FormPrefill,
  type FormState,
  type PageConfig,
  type Submission as SubmissionDto,
  type UserForm,
  type UserFormField,
} from '@strategos/shared';
import { AppException } from '../common/app-exception.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import { PageAccessService, readerOf } from '../pages/page-access.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SourceUnavailableError } from '../sources/source-data.service.js';
import { FormDataService, pageBlocks } from './form-data.service.js';
import { autoValue, conflictKeys, isConfigured, validateValues } from './form-definition.js';
import type { SubmitFormDto } from './forms.dto.js';
import { draftOf, type FormWithVersion, publishedOf } from './forms.service.js';
import { SubmissionProcessor } from './submission-processor.service.js';
import { toSubmission } from './submissions.service.js';

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);

/** Une source injoignable n'est pas une erreur du lecteur : `503 SOURCE_UNAVAILABLE`. */
async function withSource<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof SourceUnavailableError) {
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.SOURCE_UNAVAILABLE);
    }
    throw error;
  }
}

/**
 * Formulaires vus par les utilisateurs (09, 13 — routes utilisateur). L'accès
 * découle de la lecture de la page publiée qui contient le formulaire ; un
 * formulaire non configuré n'existe pas pour eux (`404`). Ni cellule, ni
 * colonne, ni source ne sont renvoyées.
 */
@Injectable()
export class FormReaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PageAccessService,
    private readonly formData: FormDataService,
    private readonly processor: SubmissionProcessor,
  ) {}

  async userForm(id: string, user: User): Promise<UserForm> {
    const { form, def } = await this.readable(id, user);
    return withSource(() => this.build(form, def, user.username));
  }

  /** Aperçu admin : le brouillon, tel que le verra l'utilisateur après publication. */
  async previewForm(id: string, admin: User): Promise<UserForm> {
    const { form, def } = await this.draft(id);
    return withSource(() => this.build(form, def, admin.username));
  }

  async prefill(id: string, user: User, rowKey: string): Promise<FormPrefill> {
    const { form, def } = await this.readable(id, user);
    if (form.mode !== 'ligne') throw notFound();
    return withSource(() => this.rowValues(def, rowKey));
  }

  async previewPrefill(id: string, rowKey: string): Promise<FormPrefill> {
    const { form, def } = await this.draft(id);
    if (form.mode !== 'ligne') throw notFound();
    return withSource(() => this.rowValues(def, rowKey));
  }

  /**
   * Soumission : les champs automatiques sont remplis ici, jamais par la
   * requête. Une ligne d'ajout n'est pas réservée : elle ne sera attribuée
   * qu'à la validation. En validation automatique, la soumission est validée
   * aussitôt par le même chemin que l'admin.
   */
  async submit(id: string, user: User, dto: SubmitFormDto): Promise<SubmissionDto> {
    const { form, def } = await this.readable(id, user);
    const state = await withSource(() => this.state(form, def));
    if (state === 'closed') {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.FORM_CLOSED);
    }
    if (state === 'full')
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.FORM_FULL);

    const { values, fields } = validateValues(def, dto.values, {
      username: user.username,
      now: new Date(),
      options: await withSource(() => this.formData.options(def)),
    });
    const rowKey = form.mode === 'ligne' ? (dto.rowKey?.trim() ?? '') : null;
    if (form.mode === 'ligne' && !rowKey) fields.rowKey = ['isDefined'];
    if (Object.keys(fields).length > 0) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, { fields });
    }
    if (rowKey !== null) {
      const rows = await withSource(() => this.formData.keyRows(def, rowKey));
      if (rows.length !== 1) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          rows.length === 0 ? ErrorCode.ROW_KEY_NOT_FOUND : ErrorCode.ROW_KEY_DUPLICATE,
        );
      }
    }

    const created = await this.prisma.submission.create({
      data: {
        formId: form.id,
        formVersion: form.publishedVersion!,
        userId: user.id,
        values: values as Prisma.InputJsonValue,
        rowKey,
        conflictKeys: conflictKeys(form.mode, def, rowKey, values),
      },
    });
    if (form.autoValidate) await this.processor.validateAutomatically(created.id);
    return toSubmission(
      await this.prisma.submission.findUniqueOrThrow({
        where: { id: created.id },
        include: { versionRef: true },
      }),
    );
  }

  /**
   * Formulaire publié et configuré, dont le bloc est dans la version publiée
   * d'une page que l'utilisateur peut lire ; sinon `404`.
   */
  private async readable(
    id: string,
    user: User,
  ): Promise<{ form: FormWithVersion; def: FormDefinition }> {
    const form = await this.prisma.form.findFirst({
      where: { id, deletedAt: null, publishedVersion: { not: null } },
      include: { published: true, page: true },
    });
    if (!form) throw notFound();
    const readable = await this.access.readablePageIds(readerOf(user), [form.pageId]);
    const published = form.page.publishedConfig as unknown as PageConfig | null;
    const onPage = pageBlocks(published).some((b) => b.id === form.blockId && b.type === 'form');
    const def = publishedOf(form);
    if (!readable.has(form.pageId) || !onPage || !def || !isConfigured(form.mode, def)) {
      throw notFound();
    }
    return { form, def };
  }

  private async draft(id: string): Promise<{ form: FormWithVersion; def: FormDefinition }> {
    const form = await this.prisma.form.findFirst({
      where: { id, deletedAt: null },
      include: { published: true },
    });
    const def = form && draftOf(form);
    if (!form || !def || !isConfigured(form.mode, def)) throw notFound();
    return { form, def };
  }

  /** Fermé (manuellement ou date limite passée), complet (zone d'ajout pleine) ou ouvert. */
  private async state(form: FormWithVersion, def: FormDefinition): Promise<FormState> {
    if (!form.isOpen || (form.closesAt && form.closesAt <= new Date())) return 'closed';
    if (form.mode === 'ajout' && (await this.formData.freeRow(def)) === null) return 'full';
    return 'open';
  }

  private async build(
    form: FormWithVersion,
    def: FormDefinition,
    username: string,
  ): Promise<UserForm> {
    const options = await this.formData.options(def);
    const now = new Date();
    const fields: UserFormField[] = def.fields.map((f) => ({
      key: f.key,
      label: f.label,
      help: f.help,
      type: f.type,
      required: f.required,
      ...(f.maxLength !== undefined ? { maxLength: f.maxLength } : {}),
      ...(f.min !== undefined ? { min: f.min } : {}),
      ...(f.max !== undefined ? { max: f.max } : {}),
      ...(f.minDate ? { minDate: f.minDate } : {}),
      ...(f.maxDate ? { maxDate: f.maxDate } : {}),
      ...(f.type === 'select' ? { options: options.get(f.key) ?? [] } : {}),
      ...(f.auto
        ? { auto: f.auto, readOnly: true as const, value: String(autoValue(f, username, now)) }
        : {}),
      ...(f.movement ? { movement: true as const } : {}),
    }));
    return {
      id: form.id,
      mode: form.mode,
      state: await this.state(form, def),
      closesAt: form.closesAt?.toISOString() ?? null,
      title: def.title,
      intro: def.intro,
      successMessage: def.successMessage,
      fields,
    };
  }

  private async rowValues(def: FormDefinition, rowKey: string): Promise<FormPrefill> {
    const rows = await this.formData.keyRows(def, rowKey);
    if (rows.length !== 1) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        rows.length === 0 ? ErrorCode.ROW_KEY_NOT_FOUND : ErrorCode.ROW_KEY_DUPLICATE,
      );
    }
    return { values: await this.formData.rowValues(def, rows[0]!) };
  }
}
