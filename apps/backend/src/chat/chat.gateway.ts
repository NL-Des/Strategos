import type { IncomingMessage } from 'node:http';
import { type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import {
  CHAT_WS_EVENTS,
  CHAT_WS_PATH,
  type ChatErrorFrame,
  type ChatJoinFrame,
  type ChatSendFrame,
  ErrorCode,
  MESSAGE_MAX_LENGTH,
} from '@strategos/shared';
import type { Server } from 'ws';
import { AppException } from '../common/app-exception.js';
import { config } from '../config.js';
import { SESSION_COOKIE } from '../auth/auth.constants.js';
import { SessionService } from '../auth/session.service.js';
import { ChatAccessService } from './chat-access.service.js';
import { ChatMessagesService } from './chat-messages.service.js';
import { ChatRealtimeService, type ChatSocket } from './chat-realtime.service.js';

/** Trame `{ event, data }` renvoyée à l'appelant. */
type Frame = { event: string; data: unknown };

/** Lit un cookie dans l'en-tête `Cookie` brut du handshake. */
function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

const REVALIDATE_INTERVAL_MS = 30_000;
const RATE_WINDOW_MS = 10_000;
/** Codes de fermeture WebSocket : règle enfreinte, trop de connexions. */
const CLOSE_POLICY = 1008;
const CLOSE_TRY_LATER = 1013;

/**
 * Passerelle WebSocket du chat (13 §4). Le préfixe global `api/v1` ne s'applique
 * pas aux passerelles, d'où le chemin explicite. Authentifiée par le **cookie de
 * session** au handshake, avec vérification de l'en-tête `Origin`. Une session
 * révoquée (compte désactivé) ferme la connexion — au message suivant et par une
 * revalidation périodique. L'accès à un salon suit la lecture de la page.
 *
 * Tout ce qu'un client envoie est borné (`config.ws`) : taille d'une trame,
 * nombre de connexions par compte, nombre de trames par connexion.
 */
@WebSocketGateway({ path: CHAT_WS_PATH })
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly sockets = new Set<ChatSocket>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly sessions: SessionService,
    private readonly access: ChatAccessService,
    private readonly messages: ChatMessagesService,
    private readonly realtime: ChatRealtimeService,
  ) {}

  /** `ws` refuse une trame trop grande avant de la lire en entier (fermeture `1009`). */
  afterInit(server: Server): void {
    server.options.maxPayload = config.ws.maxPayloadBytes;
  }

  onModuleInit(): void {
    this.timer = setInterval(() => void this.revalidateAll(), REVALIDATE_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    for (const socket of this.sockets) socket.close();
  }

  /** Handshake : `Origin` autorisé, session valide et identifiants déjà changés, sinon fermeture. */
  async handleConnection(client: ChatSocket, request: IncomingMessage): Promise<void> {
    const origin = request.headers.origin;
    if (!origin || !config.appOrigins.includes(origin)) {
      client.close();
      return;
    }
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    const auth = token ? await this.sessions.resolve(token) : null;
    // Avant le changement d'identifiants imposé, rien d'autre n'est permis (02).
    if (!auth || auth.user.mustChangeCredentials) {
      client.close();
      return;
    }
    let open = 0;
    for (const socket of this.sockets) if (socket.user?.id === auth.user.id) open += 1;
    if (open >= config.ws.maxConnectionsPerUser) {
      client.close(CLOSE_TRY_LATER);
      return;
    }
    client.sessionToken = token;
    client.user = auth.user;
    this.sockets.add(client);
    // Débit : toute trame compte, connue ou non ; au-delà du plafond, fermeture.
    client.on('message', () => {
      const now = Date.now();
      if (!client.rate || now - client.rate.start > RATE_WINDOW_MS) {
        client.rate = { start: now, count: 0 };
      }
      client.rate.count += 1;
      if (client.rate.count > config.ws.maxFramesPer10s) client.close(CLOSE_POLICY);
    });
  }

  handleDisconnect(client: ChatSocket): void {
    this.realtime.dropSocket(client);
    this.sockets.delete(client);
  }

  @SubscribeMessage(CHAT_WS_EVENTS.join)
  async join(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: ChatJoinFrame,
  ): Promise<Frame> {
    if (typeof body?.blockId !== 'string') return this.error(ErrorCode.VALIDATION_FAILED);
    const user = await this.reauth(client);
    if (!user) return this.error();
    try {
      const chat = await this.access.requireChatByBlock(user, body.blockId);
      this.realtime.join(chat.blockId, client);
      return { event: CHAT_WS_EVENTS.joined, data: { blockId: chat.blockId } };
    } catch (err) {
      return this.error(this.codeOf(err));
    }
  }

  @SubscribeMessage(CHAT_WS_EVENTS.leave)
  leave(@ConnectedSocket() client: ChatSocket, @MessageBody() body: ChatJoinFrame): void {
    if (typeof body?.blockId === 'string') this.realtime.leave(body.blockId, client);
  }

  @SubscribeMessage(CHAT_WS_EVENTS.send)
  async send(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: ChatSendFrame,
  ): Promise<Frame> {
    const user = await this.reauth(client);
    if (!user) return this.error(ErrorCode.UNAUTHENTICATED, body?.clientId);
    const content = body?.content;
    if (
      typeof body?.blockId !== 'string' ||
      typeof content !== 'string' ||
      content.length < 1 ||
      content.length > MESSAGE_MAX_LENGTH
    ) {
      return this.error(ErrorCode.VALIDATION_FAILED, body?.clientId);
    }
    try {
      const message = await this.messages.send(body.blockId, user, content);
      // Les autres membres reçoivent `created` ; l'émetteur reçoit l'accusé.
      this.realtime.broadcast(
        { type: 'chat.message.created', blockId: body.blockId, message },
        client,
      );
      return { event: CHAT_WS_EVENTS.ack, data: { clientId: body.clientId, message } };
    } catch (err) {
      return this.error(this.codeOf(err), body.clientId);
    }
  }

  /** Revalide la session du socket ; met à jour l'utilisateur ou ferme la connexion. */
  private async reauth(client: ChatSocket) {
    const auth = client.sessionToken ? await this.sessions.resolve(client.sessionToken) : null;
    if (!auth || auth.user.mustChangeCredentials) {
      client.close();
      this.handleDisconnect(client);
      return null;
    }
    client.user = auth.user;
    return auth.user;
  }

  private async revalidateAll(): Promise<void> {
    for (const socket of [...this.sockets]) {
      const auth = socket.sessionToken ? await this.sessions.resolve(socket.sessionToken) : null;
      if (!auth) {
        socket.close();
        this.handleDisconnect(socket);
      }
    }
  }

  private codeOf(err: unknown): string {
    return err instanceof AppException ? err.getBody().code : ErrorCode.INTERNAL_ERROR;
  }

  private error(code: string = ErrorCode.NOT_FOUND, clientId?: string): Frame {
    const data: ChatErrorFrame = clientId === undefined ? { code } : { clientId, code };
    return { event: CHAT_WS_EVENTS.error, data };
  }
}
