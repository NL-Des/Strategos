import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { Paginated, TrashItem } from '@strategos/shared';
import { Actor, type AuditActor } from '../audit/audit-actor.js';
import { TrashQueryDto } from './trash.dto.js';
import { TrashService } from './trash.service.js';

/** Corbeille (04, 13 — Supervision). Protégé globalement par `AdminGuard`. */
@Controller('admin/trash')
export class AdminTrashController {
  constructor(private readonly trash: TrashService) {}

  @Get()
  list(@Query() query: TrashQueryDto): Promise<Paginated<TrashItem>> {
    return this.trash.list(query);
  }

  /** Type inconnu, élément absent ou non supprimé → `404`. */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':type/:id/restore')
  async restore(
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: AuditActor,
  ): Promise<void> {
    await this.trash.restore(type, id, actor);
  }
}
