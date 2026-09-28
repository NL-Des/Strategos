import type { AssembledChatBlock, ChatEvent, ChatMessageView } from '@strategos/shared';
import { CHAT_WS_EVENTS, CHAT_WS_PATH } from '@strategos/shared';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  chatHistory,
  deleteChatMessage,
  editChatMessage,
  hideChatMessage,
  unhideChatMessage,
} from '../api/chat';
import { useMe } from '../auth/useMe';

/** Texte multi-ligne → HTML simple (le backend le nettoie à nouveau). */
function toHtml(text: string): string {
  const escape = (s: string) =>
    s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p.trim()).replaceAll('\n', '<br>')}</p>`)
    .filter((p) => p !== '<p></p>')
    .join('');
}

/** HTML nettoyé → texte, pour ré-éditer un message. */
function toText(html: string): string {
  return html
    .replace(/<\/p>\s*<p>/g, '\n\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .trim();
}

/** Adresse de la passerelle WebSocket, dérivée de l'origine courante. */
function wsUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}${CHAT_WS_PATH}`;
}

function ChatMessage({ message, isAdmin }: { message: ChatMessageView; isAdmin: boolean }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  const startEdit = () => {
    setText(toText(message.content));
    setEditing(true);
  };
  const saveEdit = (e: FormEvent) => {
    e.preventDefault();
    const html = toHtml(text);
    if (html) void editChatMessage(message.id, { content: html });
    setEditing(false);
  };

  return (
    <article className={message.hidden ? 'chat-message hidden' : 'chat-message'}>
      <header>
        <strong>{message.author.username}</strong>
        <time dateTime={message.createdAt}>
          {new Date(message.createdAt).toLocaleTimeString('fr-FR')}
        </time>
        {message.editedAt && <span className="muted"> · {t('render.chat.edited')}</span>}
        {message.hidden && <span className="badge"> {t('render.chat.hidden')}</span>}
      </header>
      {editing ? (
        <form className="chat-edit" onSubmit={saveEdit}>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="actions">
            <button type="submit">{t('common.save')}</button>
            <button type="button" className="secondary" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      ) : (
        <div className="message-body" dangerouslySetInnerHTML={{ __html: message.content }} />
      )}
      <div className="actions">
        {message.mine && !editing && (
          <>
            <button type="button" className="secondary" onClick={startEdit}>
              {t('common.edit')}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                if (confirm(t('render.chat.confirmDelete'))) void deleteChatMessage(message.id);
              }}
            >
              {t('common.delete')}
            </button>
          </>
        )}
        {isAdmin && (
          <button
            type="button"
            className="secondary"
            onClick={() =>
              void (message.hidden ? unhideChatMessage(message.id) : hideChatMessage(message.id))
            }
          >
            {message.hidden ? t('render.chat.unhide') : t('render.chat.hide')}
          </button>
        )}
      </div>
    </article>
  );
}

/**
 * Chat temps réel (07). Charge l'historique par `messagesUrl`, puis maintient une
 * connexion WebSocket : rejoint le salon (`chat.join`), envoie (`chat.send`) et
 * applique les événements diffusés. À la reconnexion, rattrape les messages
 * manqués via `?after=<dernier id reçu>`.
 */
export function ChatBlock({ block }: { block: AssembledChatBlock }) {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const { name, height } = block.config;
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [connected, setConnected] = useState(false);
  const [draft, setDraft] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const lastIdRef = useRef<string | null>(null);
  const closedRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = me?.isAdmin ?? false;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let joinTimer: ReturnType<typeof setInterval> | undefined;
    closedRef.current = false;

    const noteId = (id: string) => {
      if (!lastIdRef.current || id > lastIdRef.current) lastIdRef.current = id;
    };

    const upsert = (message: ChatMessageView) => {
      noteId(message.id);
      setMessages((prev) => {
        const i = prev.findIndex((m) => m.id === message.id);
        if (i === -1) return [...prev, message];
        const next = [...prev];
        next[i] = message;
        return next;
      });
    };

    const applyEvent = (event: ChatEvent) => {
      switch (event.type) {
        case 'chat.message.created':
        case 'chat.message.updated':
          upsert(event.message);
          break;
        case 'chat.message.deleted':
          setMessages((prev) => prev.filter((m) => m.id !== event.message.id));
          break;
        case 'chat.message.hidden':
          // L'admin garde le message (il en a le contenu) et le marque masqué ;
          // les autres le retirent.
          setMessages((prev) =>
            isAdmin
              ? prev.map((m) => (m.id === event.message.id ? { ...m, hidden: true } : m))
              : prev.filter((m) => m.id !== event.message.id),
          );
          break;
      }
    };

    const loadHistory = async (after?: string) => {
      const items = await chatHistory(block.messagesUrl, after ? { after } : {});
      for (const m of items) noteId(m.id);
      setMessages((prev) => (after ? mergeById(prev, items) : items));
    };

    const connect = () => {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        // `chat.join` peut arriver avant que le serveur ait fini d'attacher ses
        // gestionnaires ; on répète jusqu'à recevoir `chat.joined`.
        const join = () =>
          ws.send(JSON.stringify({ event: CHAT_WS_EVENTS.join, data: { blockId: block.id } }));
        join();
        joinTimer = setInterval(join, 500);
      };
      ws.onmessage = (raw) => {
        let frame: { event?: string; data?: unknown };
        try {
          frame = JSON.parse(String(raw.data));
        } catch {
          return;
        }
        if (frame.event === CHAT_WS_EVENTS.joined) {
          if (joinTimer) clearInterval(joinTimer);
          joinTimer = undefined;
        } else if (frame.event === CHAT_WS_EVENTS.ack) {
          upsert((frame.data as { message: ChatMessageView }).message);
        } else if (typeof frame.event === 'string' && frame.event.startsWith('chat.message.')) {
          applyEvent({ type: frame.event, ...(frame.data as object) } as ChatEvent);
        }
      };
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (joinTimer) clearInterval(joinTimer);
        joinTimer = undefined;
        if (closedRef.current) return;
        // Reconnexion : rejoint le salon et rattrape les messages manqués.
        timer = setTimeout(() => {
          void loadHistory(lastIdRef.current ?? undefined);
          connect();
        }, 1000);
      };
    };

    void loadHistory();
    connect();

    return () => {
      closedRef.current = true;
      if (timer) clearTimeout(timer);
      if (joinTimer) clearInterval(joinTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [block.id, block.messagesUrl, isAdmin]);

  // Défile vers le dernier message à chaque ajout.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const send = (e: FormEvent) => {
    e.preventDefault();
    const html = toHtml(draft);
    const ws = wsRef.current;
    if (!html || !ws || ws.readyState !== ws.OPEN) return;
    ws.send(
      JSON.stringify({
        event: CHAT_WS_EVENTS.send,
        data: { blockId: block.id, clientId: crypto.randomUUID(), content: html },
      }),
    );
    setDraft('');
  };

  return (
    <section className="block-chat">
      <h3>{name}</h3>
      <div className="chat-messages" ref={listRef} style={{ height }}>
        {messages.length === 0 && <p className="muted">{t('render.chat.empty')}</p>}
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} isAdmin={me?.isAdmin ?? false} />
        ))}
      </div>
      <form className="block-form chat-composer" onSubmit={send}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connected ? t('render.chat.placeholder') : t('render.chat.connecting')}
          aria-label={t('render.chat.message')}
        />
        <button type="submit" disabled={!connected}>
          {t('render.chat.send')}
        </button>
      </form>
    </section>
  );
}

/** Ajoute les messages absents à la liste, en conservant l'ordre chronologique. */
function mergeById(prev: ChatMessageView[], added: ChatMessageView[]): ChatMessageView[] {
  const seen = new Set(prev.map((m) => m.id));
  return [...prev, ...added.filter((m) => !seen.has(m.id))];
}
