import { Injectable } from '@nestjs/common';
import type { ChatEvent } from '@strategos/shared';
import type { WebSocket } from 'ws';
import type { User } from '../generated/prisma/client.js';

/** Socket d'un client de chat, enrichi de sa session et des salons rejoints. */
export interface ChatSocket extends WebSocket {
  /** Jeton de session en clair, revalidé à chaque message. */
  sessionToken?: string;
  user?: User;
  /** `blockId` des salons rejoints par ce socket. */
  rooms?: Set<string>;
  /** Fenêtre de débit en cours : début et nombre de trames reçues. */
  rate?: { start: number; count: number };
}

/**
 * Registre des salons de chat et diffusion des événements (07, 13 §4). Sans
 * dépendance : point d'indirection que la passerelle **et** les services REST
 * injectent pour diffuser, ce qui évite une dépendance circulaire
 * passerelle ↔ services. Le drapeau `mine` est recalculé par destinataire.
 */
@Injectable()
export class ChatRealtimeService {
  private readonly rooms = new Map<string, Set<ChatSocket>>();

  join(blockId: string, socket: ChatSocket): void {
    let room = this.rooms.get(blockId);
    if (!room) {
      room = new Set();
      this.rooms.set(blockId, room);
    }
    room.add(socket);
    (socket.rooms ??= new Set()).add(blockId);
  }

  leave(blockId: string, socket: ChatSocket): void {
    this.rooms.get(blockId)?.delete(socket);
    socket.rooms?.delete(blockId);
  }

  /** Retire un socket déconnecté de tous ses salons. */
  dropSocket(socket: ChatSocket): void {
    for (const blockId of socket.rooms ?? []) {
      this.rooms.get(blockId)?.delete(socket);
    }
    socket.rooms?.clear();
  }

  /** Sockets connectés d'un compte donné, tous salons confondus (pour fermer une session révoquée). */
  socketsOfUser(userId: string): Set<ChatSocket> {
    const found = new Set<ChatSocket>();
    for (const room of this.rooms.values()) {
      for (const socket of room) {
        if (socket.user?.id === userId) found.add(socket);
      }
    }
    return found;
  }

  /**
   * Diffuse un événement aux membres du salon. `exclude` : socket de l'émetteur,
   * qui reçoit un accusé plutôt que l'événement. Le `mine` d'un message complet
   * est réévalué pour chaque destinataire.
   */
  broadcast(event: ChatEvent, exclude?: ChatSocket): void {
    const room = this.rooms.get(event.blockId);
    if (!room) return;
    for (const socket of room) {
      if (socket === exclude) continue;
      const data =
        event.type === 'chat.message.created' || event.type === 'chat.message.updated'
          ? {
              blockId: event.blockId,
              message: { ...event.message, mine: socket.user?.id === event.message.author.id },
            }
          : { blockId: event.blockId, message: event.message };
      this.sendFrame(socket, event.type, data);
    }
  }

  /** Envoie une trame `{ event, data }` à un socket, si ouvert. */
  sendFrame(socket: ChatSocket, event: string, data: unknown): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ event, data }));
    }
  }
}
