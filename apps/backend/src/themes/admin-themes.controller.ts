import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import type { Theme } from '@strategos/shared';
import { Actor, type AuditActor } from '../audit/audit-actor.js';
import { CreateThemeDto, UpdateThemeDto } from './themes.dto.js';
import { ThemesService } from './themes.service.js';
import { AdminOnly } from '../auth/decorators.js';

/** Thèmes, côté admin (13 — Page builder). Protégé globalement par `AdminGuard`. */
@AdminOnly()
@Controller('admin/themes')
export class AdminThemesController {
  constructor(private readonly themes: ThemesService) {}

  @Get()
  list(): Promise<Theme[]> {
    return this.themes.list();
  }

  @Post()
  create(@Body() dto: CreateThemeDto, @Actor() actor: AuditActor): Promise<Theme> {
    return this.themes.create(dto, actor);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Theme> {
    return this.themes.get(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateThemeDto,
    @Actor() actor: AuditActor,
  ): Promise<Theme> {
    return this.themes.update(id, dto, actor);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: AuditActor): Promise<void> {
    await this.themes.remove(id, actor);
  }
}
