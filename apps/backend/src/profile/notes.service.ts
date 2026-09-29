import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditAction, AuditTargetType, ErrorCode, type Note } from '@strategos/shared';
import type { AuditActor } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/app-exception.js';
import { sanitizeNoteHtml } from '../common/html-sanitizer.js';
import type { UserNote } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Db } from '../prisma/prisma.types.js';
import type { NoteDto } from './notes.dto.js';

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);

/**
 * Notes personnelles (05). Accès par propriété : l'utilisateur ne voit que les
 * siennes (une note d'autrui est introuvable). L'admin les lit seulement, et
 * chaque lecture est tracée (`notes.read`).
 */
@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string): Promise<Note[]> {
    return this.listIn(this.prisma, userId);
  }

  async create(userId: string, dto: NoteDto): Promise<Note> {
    const note = await this.prisma.userNote.create({
      data: { userId, title: dto.title, content: sanitizeNoteHtml(dto.content) },
    });
    return toNote(note);
  }

  async update(userId: string, id: string, dto: NoteDto): Promise<Note> {
    const { count } = await this.prisma.userNote.updateMany({
      where: { id, userId, deletedAt: null },
      data: { title: dto.title, content: sanitizeNoteHtml(dto.content) },
    });
    if (count === 0) throw notFound();
    return toNote(await this.prisma.userNote.findUniqueOrThrow({ where: { id } }));
  }

  /** Suppression douce (11 — Suppression de contenu). */
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.userNote.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (count === 0) throw notFound();
  }

  /** Lecture par l'admin, depuis la fiche du compte : chaque appel est tracé. */
  async readAsAdmin(userId: string, actor: AuditActor): Promise<Note[]> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({ where: { id: userId, deletedAt: null } });
      if (!user) throw notFound();
      const notes = await this.listIn(tx, userId);
      await this.audit.record(tx, actor, {
        action: AuditAction.NOTES_READ,
        targetType: AuditTargetType.USER,
        targetId: userId,
        after: { username: user.username, count: notes.length },
      });
      return notes;
    });
  }

  private async listIn(db: Db, userId: string): Promise<Note[]> {
    const notes = await db.userNote.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    return notes.map(toNote);
  }
}

function toNote(note: UserNote): Note {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}
