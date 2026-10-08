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
import type { Note } from '@strategos/shared';
import { Actor, type AuditActor } from '../audit/audit-actor.js';
import { AdminOnly, CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/request-context.js';
import { NoteDto } from './notes.dto.js';
import { NotesService } from './notes.service.js';

/** Notes de l'utilisateur connecté (13 — Profil) : accès par propriété. */
@Controller('me/notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext): Promise<Note[]> {
    return this.notes.list(auth.user.id);
  }

  @Post()
  create(@CurrentAuth() auth: AuthContext, @Body() dto: NoteDto): Promise<Note> {
    return this.notes.create(auth.user.id, dto);
  }

  @Put(':id')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NoteDto,
  ): Promise<Note> {
    return this.notes.update(auth.user.id, id, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.notes.remove(auth.user.id, id);
  }
}

/**
 * Notes d'un compte, côté admin (13 — Comptes) : lecture seule, chaque appel
 * écrit `notes.read` au journal. Aucune route d'écriture.
 */
@AdminOnly()
@Controller('admin/users')
export class AdminUserNotesController {
  constructor(private readonly notes: NotesService) {}

  @Get(':id/notes')
  read(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: AuditActor): Promise<Note[]> {
    return this.notes.readAsAdmin(id, actor);
  }
}
