import type { AssembledChatBlock, ChatEvent, ChatMessageView } from '@strategos/shared';
import { CHAT_WS_EVENTS, CHAT_WS_PATH } from '@strategos/shared';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  chatHistory,
  deleteChatMessage,
  editChatMessage,
  hideChatMessage,
  unhideChatMessage,
} from '../api/chat';
import { useMe } from '../auth/useMe';
import { ActionMenu } from '../components/ActionMenu';
import { useConfirmed } from '../components/Dialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { Notice } from '../components/Notice';
import { formatMessageTime } from '../format';
import { toHtml, toText } from './messageText';

/** Adresse de la passerelle WebSocket, dérivée de l'origine courante. */
function wsUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}${CHAT_WS_PATH}`;
}

function ChatMessage({ message, isAdmin }: { message: ChatMessageView; isAdmin: boolean }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const confirmed = useConfirmed();
  // Une action refusée (message déjà supprimé, droit retiré…) s'affiche sous le message.
  const [error, setError] = useState<unknown>(null);
  const run = (action: Promise<unknown>) => {
    setError(null);
    return action.then(
      () => true,
      (failure: unknown) => {
        setError(failure);
        return false;
      },
    );
  };

  const startEdit = () => {
    setText(toText(message.content));
    setEditing(true);
  };
  const saveEdit = (e: FormEvent) => {
    e.preventDefault();
    const html = toHtml(text);
    if (!html) return setEditing(false);
    // L'édition ne se referme que si la modification est acceptée.
    void run(editChatMessage(message.id, { content: html })).then((ok) => {
      if (ok) setEditing(false);
    });
  };

  return (
    <article className={message.hidden ? 'chat-message hidden' : 'chat-message'}>
      <header>
        <strong>{message.author.username}</strong>
        <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
        {message.editedAt && <span className="muted"> · {t('render.chat.edited')}</span>}
        {message.hidden && <span className="badge"> {t('render.chat.hidden')}</span>}
      </header>
      {editing ? (
        <form className="chat-edit" onSubmit={saveEdit}>
          <textarea
            rows={2}
            aria-label={t('render.chat.message')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
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
      <ErrorMessage error={error} />
      {(message.mine || isAdmin) && !editing && (
        <ActionMenu label={t('render.chat.options')}>
          {message.mine && (
            <>
              <button type="button" className="menu-item" role="menuitem" onClick={startEdit}>
                {t('common.edit')}
              </button>
              <button
                type="button"
                className="menu-item"
                role="menuitem"
                onClick={() =>
                  confirmed(
                    {
                      title: t('render.chat.confirmDelete'),
                      confirmLabel: t('common.delete'),
                      danger: true,
                    },
                    () => void run(deleteChatMessage(message.id)),
                  )
                }
              >
                {t('common.delete')}
              </button>
            </>
          )}
          {isAdmin && (
            <button
              type="button"
              className="menu-item"
              role="menuitem"
              onClick={() =>
                void run(
                  message.hidden ? unhideChatMessage(message.id) : hideChatMessage(message.id),
                )
              }
            >
              {message.hidden ? t('render.chat.unhide') : t('render.chat.hide')}
            </button>
          )}
        </ActionMenu>
      )}
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
  // Connexion perdue après avoir été établie : annoncée, la saisie est conservée.
  const [lost, setLost] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [historyError, setHistoryError] = useState<unknown>(null);
  const [draft, setDraft] = useState('');
  // Vrai tant que le lecteur est en bas de la liste : on ne le ramène pas en bas s'il relit.
  const stickRef = useRef(true);
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
      try {
        const items = await chatHistory(block.messagesUrl, after ? { after } : {});
        for (const m of items) noteId(m.id);
        setMessages((prev) => (after ? mergeById(prev, items) : items));
        setHistoryError(null);
        setLoaded(true);
      } catch (failure) {
        setHistoryError(failure);
      }
    };

    const connect = () => {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        setLost(false);
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
        setLost(true);
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

  // Défile vers le dernier message à chaque ajout, sauf si le lecteur est remonté dans l'historique.
  useEffect(() => {
    if (stickRef.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);
  const onScroll = () => {
    const list = listRef.current;
    if (list) stickRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  };

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    const html = toHtml(draft);
    const ws = wsRef.current;
    if (!html || !ws || ws.readyState !== ws.OPEN) return;
    ws.send(
      JSON.stringify({
        event: CHAT_WS_EVENTS.send,
        data: { blockId: block.id, clientId: crypto.randomUUID(), content: html },
      }),
    );
    stickRef.current = true;
    setDraft('');
  };
  // Entrée envoie, Maj+Entrée passe à la ligne.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e);
  };

  return (
    <section className="block-chat">
      <h3>{name}</h3>
      <div className="chat-messages" ref={listRef} style={{ height }} onScroll={onScroll}>
        {loaded && messages.length === 0 && <p className="muted">{t('render.chat.empty')}</p>}
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} isAdmin={me?.isAdmin ?? false} />
        ))}
      </div>
      <ErrorMessage error={historyError} />
      {lost && (
        <Notice tone="warning" role="status">
          {t('render.chat.disconnected')}
        </Notice>
      )}
      <form className="block-form chat-composer" onSubmit={send}>
        <textarea
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
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
