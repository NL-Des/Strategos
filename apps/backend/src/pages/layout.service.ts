import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AdminLayoutPart,
  type AssembledLayout,
  type AssembledRow,
  AuditAction,
  AuditTargetType,
  EMPTY_LAYOUT_CONFIG,
  ErrorCode,
  type LayoutConfig,
  LayoutKind,
  type Row,
} from '@strategos/shared';
import type { AuditActor } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/app-exception.js';
import type { LayoutPart, Prisma, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assembleRows } from './assembler.js';
import { DataBlocksService } from './data-blocks.service.js';
import { countBlocks, validateLayoutConfig } from './config-validator.js';
import type { SaveLayoutDraftDto } from './pages.dto.js';
import { type PreparedContext, ReaderContextService } from './reader-context.service.js';

function draftOf(part: LayoutPart): LayoutConfig {
  return { ...EMPTY_LAYOUT_CONFIG, ...(part.draftConfig as object) } as LayoutConfig;
}

function publishedOf(part: LayoutPart): LayoutConfig | null {
  return part.publishedConfig ? (part.publishedConfig as unknown as LayoutConfig) : null;
}

function toAdmin(part: LayoutPart): AdminLayoutPart {
  return {
    kind: part.kind,
    draft: draftOf(part),
    published: publishedOf(part),
    publishedAt: part.publishedAt?.toISOString() ?? null,
    version: part.version,
  };
}

function auditState(part: LayoutPart, config: LayoutConfig | null) {
  return {
    kind: part.kind,
    published: part.publishedAt !== null,
    blocks: config ? countBlocks([config.rows]) : 0,
  };
}

/** Header et footer partagés (06) : même cycle brouillon → publication que les pages. */
@Injectable()
export class LayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly readers: ReaderContextService,
    private readonly dataBlocks: DataBlocksService,
  ) {}

  async get(kind: LayoutKind): Promise<AdminLayoutPart> {
    return toAdmin(await this.prisma.layoutPart.findUniqueOrThrow({ where: { kind } }));
  }

  async saveDraft(kind: LayoutKind, dto: SaveLayoutDraftDto, actor: AuditActor) {
    const config = validateLayoutConfig(dto.config);
    await this.dataBlocks.checkReferences({ '': config.rows }, 'config.rows');
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.layoutPart.findUniqueOrThrow({ where: { kind } });
      const { count } = await tx.layoutPart.updateMany({
        where: { kind, version: dto.version },
        data: {
          draftConfig: config as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      if (count === 0) throw new AppException(HttpStatus.CONFLICT, ErrorCode.EDIT_CONFLICT);
      const after = await tx.layoutPart.findUniqueOrThrow({ where: { kind } });
      await this.audit.record(tx, actor, {
        action: AuditAction.LAYOUT_UPDATE,
        targetType: AuditTargetType.LAYOUT,
        before: auditState(before, draftOf(before)),
        after: auditState(after, config),
      });
      return toAdmin(after);
    });
  }

  async publish(kind: LayoutKind, actor: AuditActor): Promise<AdminLayoutPart> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.layoutPart.findUniqueOrThrow({ where: { kind } });
      const config = validateLayoutConfig(before.draftConfig);
      const after = await tx.layoutPart.update({
        where: { kind },
        data: {
          publishedConfig: config as unknown as Prisma.InputJsonValue,
          publishedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.audit.record(tx, actor, {
        action: AuditAction.LAYOUT_PUBLISH,
        targetType: AuditTargetType.LAYOUT,
        before: auditState(before, publishedOf(before)),
        after: auditState(after, config),
      });
      return toAdmin(after);
    });
  }

  async preview(kind: LayoutKind, admin: User, asGroup?: string): Promise<AssembledRow[]> {
    const { rows } = draftOf(await this.prisma.layoutPart.findUniqueOrThrow({ where: { kind } }));
    return assembleRows(rows, await this.readers.forPreview(admin, asGroup, rows));
  }

  /** Header et footer publiés, assemblés pour un lecteur. */
  async read(user: User): Promise<AssembledLayout> {
    return this.assemblePublished((rows) => this.readers.forUser(user, rows));
  }

  /**
   * Header et footer publiés, vus par l'admin ou avec les droits d'un groupe :
   * ceux qui encadrent l'aperçu d'une page.
   */
  async previewPublished(admin: User, asGroup?: string): Promise<AssembledLayout> {
    return this.assemblePublished((rows) => this.readers.forPreview(admin, asGroup, rows));
  }

  private async assemblePublished(
    contextFor: (rows: Row[]) => Promise<PreparedContext>,
  ): Promise<AssembledLayout> {
    const parts = await this.prisma.layoutPart.findMany();
    const published = (kind: LayoutKind) => {
      const part = parts.find((p) => p.kind === kind);
      return part ? publishedOf(part) : null;
    };
    const header = published(LayoutKind.header);
    const footer = published(LayoutKind.footer);
    const ctx = await contextFor([...(header?.rows ?? []), ...(footer?.rows ?? [])]);
    return {
      header: header ? assembleRows(header.rows, ctx) : null,
      footer: footer ? assembleRows(footer.rows, ctx) : null,
    };
  }
}
