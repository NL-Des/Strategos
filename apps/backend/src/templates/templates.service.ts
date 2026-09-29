import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditTargetType,
  type Block,
  ErrorCode,
  type FormDefinition,
  type FormTemplatePayload,
  type InstantiateResult,
  type PageConfig,
  type PageTemplatePayload,
  TemplateType,
  type TemplateSummary,
  type TopicTemplatePayload,
} from '@strategos/shared';
import type { AuditActor } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/app-exception.js';
import type { Prisma, Template, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation } from '../prisma/prisma.types.js';
import {
  copyPageConfig,
  pageBlocks,
  resetFormDefinition,
  resetPageConfig,
} from './template-reset.js';
import type { CreateTemplateDto, InstantiateTemplateDto } from './templates.dto.js';

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
const invalid = (fields: Record<string, string[]>) =>
  new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, { fields });
const json = (value: unknown) => value as Prisma.InputJsonValue;

type Tx = Prisma.TransactionClient;

/**
 * Bibliothèque de modèles (10) : formulaires, pages et sujets. Le modèle est
 * enregistré sans mappings ni plages ; chaque instance est une copie
 * indépendante, créée en brouillon et sans permission.
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(type?: TemplateType): Promise<TemplateSummary[]> {
    const templates = await this.prisma.template.findMany({
      where: type ? { type } : {},
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return templates.map(toSummary);
  }

  async create(dto: CreateTemplateDto, user: User, actor: AuditActor): Promise<TemplateSummary> {
    const payload = await this.payloadOf(dto.type, dto.sourceId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const template = await tx.template.create({
          data: {
            type: dto.type,
            name: dto.name,
            payload: json(payload),
            createdBy: user.id,
          },
        });
        await this.audit.record(tx, actor, {
          action: AuditAction.TEMPLATE_CREATE,
          targetType: AuditTargetType.TEMPLATE,
          targetId: template.id,
          after: { type: template.type, name: template.name, sourceId: dto.sourceId },
        });
        return toSummary(template);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(HttpStatus.CONFLICT, ErrorCode.TEMPLATE_NAME_TAKEN);
      }
      throw error;
    }
  }

  /** Suppression physique : les instances sont indépendantes (14 — `templates`). */
  async remove(id: string, actor: AuditActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const template = await tx.template.findUnique({ where: { id } });
      if (!template) throw notFound();
      await tx.template.delete({ where: { id } });
      await this.audit.record(tx, actor, {
        action: AuditAction.TEMPLATE_DELETE,
        targetType: AuditTargetType.TEMPLATE,
        targetId: id,
        before: { type: template.type, name: template.name },
      });
    });
  }

  async instantiate(
    id: string,
    dto: InstantiateTemplateDto,
    user: User,
    actor: AuditActor,
  ): Promise<InstantiateResult> {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) throw notFound();
    return this.prisma.$transaction(async (tx) => {
      const result =
        template.type === TemplateType.page
          ? await this.instantiatePage(tx, template, dto)
          : template.type === TemplateType.form
            ? await this.instantiateForm(tx, template, dto)
            : await this.instantiateTopic(tx, template, dto, user);
      await this.audit.record(tx, actor, {
        action: AuditAction.TEMPLATE_INSTANTIATE,
        targetType: AuditTargetType.TEMPLATE,
        targetId: template.id,
        after: { name: template.name, ...result },
      });
      return result;
    });
  }

  /** Copie réinitialisée de la réalisation citée. */
  private async payloadOf(
    type: TemplateType,
    sourceId: string,
  ): Promise<FormTemplatePayload | PageTemplatePayload | TopicTemplatePayload> {
    if (type === TemplateType.form) {
      const form = await this.prisma.form.findFirst({ where: { id: sourceId, deletedAt: null } });
      if (!form) throw invalid({ sourceId: ['notFound'] });
      return formPayload(form.mode, form.draftDefinition);
    }
    if (type === TemplateType.page) {
      const page = await this.prisma.page.findFirst({ where: { id: sourceId, deletedAt: null } });
      if (!page) throw invalid({ sourceId: ['notFound'] });
      const config = page.draftConfig as unknown as PageConfig;
      const formIds = pageBlocks(config).flatMap((b) =>
        b.type === 'form' ? [b.config.formId] : [],
      );
      const forms = await this.prisma.form.findMany({
        where: { id: { in: formIds }, pageId: page.id, deletedAt: null },
      });
      const payloads: Record<string, FormTemplatePayload> = {};
      for (const form of forms)
        payloads[form.blockId] = formPayload(form.mode, form.draftDefinition);
      return { config: resetPageConfig(config), forms: payloads };
    }
    const topic = await this.prisma.topic.findFirst({
      where: { id: sourceId, deletedAt: null },
      include: {
        messages: { where: { deletedAt: null }, orderBy: { id: 'asc' }, take: 1 },
      },
    });
    if (!topic) throw invalid({ sourceId: ['notFound'] });
    return { title: topic.title, message: topic.messages[0]?.content ?? '' };
  }

  /**
   * Nouvelle page en brouillon, sans permission : nouveaux blocs, formulaires
   * recréés non configurés ; espaces et chats seront créés vides à la publication.
   */
  private async instantiatePage(
    tx: Tx,
    template: Template,
    dto: InstantiateTemplateDto,
  ): Promise<InstantiateResult> {
    const payload = template.payload as unknown as PageTemplatePayload;
    const forms: { id: string; blockId: string; form: FormTemplatePayload }[] = [];
    const config = copyPageConfig(payload.config, randomUUID, (block, blockId): Block | null => {
      if (block.type !== 'form') return { ...block, id: blockId };
      const form = payload.forms[block.id];
      if (!form) return null;
      const formId = randomUUID();
      forms.push({ id: formId, blockId, form });
      return { ...block, id: blockId, config: { formId } };
    });
    const page = await tx.page.create({
      data: { name: dto.name ?? template.name.slice(0, 100), draftConfig: json(config) },
    });
    for (const { id, blockId, form } of forms) {
      await tx.form.create({
        data: {
          id,
          pageId: page.id,
          blockId,
          mode: form.mode,
          draftDefinition: json(form.definition),
        },
      });
    }
    return { type: 'page', pageId: page.id };
  }

  /** Formulaire non configuré, rattaché à un bloc du brouillon d'une page. */
  private async instantiateForm(
    tx: Tx,
    template: Template,
    dto: InstantiateTemplateDto,
  ): Promise<InstantiateResult> {
    if (!dto.pageId || !dto.pageBlockId) {
      throw invalid({
        ...(dto.pageId ? {} : { pageId: ['isDefined'] }),
        ...(dto.pageBlockId ? {} : { pageBlockId: ['isDefined'] }),
      });
    }
    if (!(await tx.page.count({ where: { id: dto.pageId, deletedAt: null } }))) throw notFound();
    if (await tx.form.count({ where: { blockId: dto.pageBlockId } })) {
      throw invalid({ pageBlockId: ['duplicateId'] });
    }
    const payload = template.payload as unknown as FormTemplatePayload;
    const form = await tx.form.create({
      data: {
        pageId: dto.pageId,
        blockId: dto.pageBlockId,
        mode: payload.mode,
        draftDefinition: json(payload.definition),
      },
    });
    return { type: 'form', formId: form.id };
  }

  /** Sujet ouvert par l'admin dans l'espace choisi : titre et message d'ouverture. */
  private async instantiateTopic(
    tx: Tx,
    template: Template,
    dto: InstantiateTemplateDto,
    user: User,
  ): Promise<InstantiateResult> {
    if (!dto.spaceId) throw invalid({ spaceId: ['isDefined'] });
    const space = await tx.discussionSpace.findFirst({
      where: { id: dto.spaceId, deletedAt: null },
    });
    if (!space) throw notFound();
    const payload = template.payload as unknown as TopicTemplatePayload;
    const topic = await tx.topic.create({
      data: { spaceId: space.id, authorId: user.id, title: payload.title },
    });
    if (payload.message) {
      await tx.topicMessage.create({
        data: { topicId: topic.id, authorId: user.id, content: payload.message },
      });
    }
    return { type: 'topic', topicId: topic.id, spaceId: space.id };
  }
}

function formPayload(mode: FormTemplatePayload['mode'], definition: unknown): FormTemplatePayload {
  return { mode, definition: resetFormDefinition(mode, definition as FormDefinition) };
}

function toSummary(template: Template): TemplateSummary {
  return {
    id: template.id,
    type: template.type,
    name: template.name,
    createdAt: template.createdAt.toISOString(),
    details: describe(template),
  };
}

/** Résumé affiché dans la bibliothèque. */
function describe(template: Template): TemplateSummary['details'] {
  if (template.type === TemplateType.form) {
    const p = template.payload as unknown as FormTemplatePayload;
    return { mode: p.mode, fields: p.definition.fields.length };
  }
  if (template.type === TemplateType.page) {
    const p = template.payload as unknown as PageTemplatePayload;
    return { blocks: pageBlocks(p.config).length };
  }
  return { title: (template.payload as unknown as TopicTemplatePayload).title };
}
