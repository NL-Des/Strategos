import type {
  AssembledDiscussionSpaceBlock,
  AttachmentRef,
  TopicMessageView,
} from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteTopic, hideMessage, pinTopic, unhideMessage } from '../api/admin-discussions';
import {
  deleteMessage,
  editMessage,
  getTopic,
  listTopics,
  openTopic,
  patchTopic,
  postMessage,
  uploadAttachment,
} from '../api/discussions';
import { useMe } from '../auth/useMe';
import { SaveAsTemplate } from '../components/SaveAsTemplate';
import { ErrorMessage } from '../components/ErrorMessage';

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

function Attachments({ items }: { items: AttachmentRef[] }) {
  if (items.length === 0) return null;
  return (
    <div className="message-attachments">
      {items.map((a) => (
        <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
          <img src={a.url} alt="" />
        </a>
      ))}
    </div>
  );
}

/** Saisie d'un message : texte et pièces jointes images. */
function Composer({
  submitLabel,
  pending,
  onSubmit,
  onCancel,
  initial = '',
  title,
}: {
  submitLabel: string;
  pending: boolean;
  onSubmit: (content: string, attachmentIds: string[]) => void;
  onCancel?: () => void;
  initial?: string;
  title?: { value: string; onChange: (v: string) => void };
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initial);
  const [attachments, setAttachments] = useState<AttachmentRef[]>([]);
  const upload = useMutation({ mutationFn: uploadAttachment });

  const addFiles = async (files: FileList | null) => {
    for (const file of Array.from(files ?? []).slice(0, 4 - attachments.length)) {
      const ref = await upload.mutateAsync(file);
      setAttachments((prev) => [...prev, ref]);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const html = toHtml(text);
    if (!html) return;
    onSubmit(
      html,
      attachments.map((a) => a.id),
    );
    setText('');
    setAttachments([]);
  };

  return (
    <form className="block-form message-composer" onSubmit={submit}>
      {title && (
        <label>
          {t('render.discussion.topicTitle')}
          <input value={title.value} onChange={(e) => title.onChange(e.target.value)} required />
        </label>
      )}
      <label>
        {t('render.discussion.message')}
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} required />
      </label>
      <Attachments items={attachments} />
      <label className="attach">
        {t('render.discussion.addImages')}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          disabled={attachments.length >= 4}
          onChange={(e) => void addFiles(e.target.files)}
        />
      </label>
      <ErrorMessage error={upload.error} />
      <div className="actions">
        <button type="submit" disabled={pending || upload.isPending}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}

function Message({
  message,
  onEdited,
  onDeleted,
}: {
  message: TopicMessageView;
  onEdited: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const [editing, setEditing] = useState(false);
  const edit = useMutation({
    mutationFn: (content: string) => editMessage(message.id, { content }),
    onSuccess: () => {
      setEditing(false);
      onEdited();
    },
  });
  const remove = useMutation({ mutationFn: () => deleteMessage(message.id), onSuccess: onDeleted });
  const moderate = useMutation({
    mutationFn: () => (message.hidden ? unhideMessage(message.id) : hideMessage(message.id)),
    onSuccess: onEdited,
  });

  if (editing) {
    return (
      <Composer
        submitLabel={t('common.save')}
        pending={edit.isPending}
        initial={toText(message.content)}
        onSubmit={(content) => edit.mutate(content)}
        onCancel={() => setEditing(false)}
      />
    );
  }
  return (
    <article className={message.hidden ? 'topic-message hidden' : 'topic-message'}>
      <header>
        <strong>{message.author.username}</strong>
        <time dateTime={message.createdAt}>
          {new Date(message.createdAt).toLocaleString('fr-FR')}
        </time>
        {message.editedAt && <span className="muted"> · {t('render.discussion.edited')}</span>}
        {message.hidden && <span className="badge"> {t('render.discussion.hidden')}</span>}
      </header>
      <div className="message-body" dangerouslySetInnerHTML={{ __html: message.content }} />
      <Attachments items={message.attachments} />
      <div className="actions">
        {message.mine && (
          <>
            <button type="button" className="secondary" onClick={() => setEditing(true)}>
              {t('common.edit')}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                if (confirm(t('render.discussion.confirmDelete'))) remove.mutate();
              }}
            >
              {t('common.delete')}
            </button>
          </>
        )}
        {me?.isAdmin && (
          <button type="button" className="secondary" onClick={() => moderate.mutate()}>
            {message.hidden ? t('render.discussion.unhide') : t('render.discussion.hide')}
          </button>
        )}
      </div>
    </article>
  );
}

function TopicView({ topicId, onBack }: { topicId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const key = ['topic', topicId, page];
  const query = useQuery({ queryKey: key, queryFn: () => getTopic(topicId, page) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['topic', topicId] });
  const reply = useMutation({
    mutationFn: (body: { content: string; attachmentIds: string[] }) => postMessage(topicId, body),
    onSuccess: () => void refresh(),
  });
  const close = useMutation({
    mutationFn: () => patchTopic(topicId, { closed: true }),
    onSuccess: () => void refresh(),
  });
  const remove = useMutation({
    mutationFn: () => deleteTopic(topicId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['topics'] });
      onBack();
    },
  });
  const { data: me } = useMe();

  if (query.error) return <ErrorMessage error={query.error} />;
  if (!query.data) return <p>{t('common.loading')}</p>;
  const { topic, messages } = query.data;
  const pageCount = Math.max(1, Math.ceil(messages.total / messages.pageSize));

  return (
    <div className="topic-view">
      <div className="actions">
        <button type="button" className="secondary" onClick={onBack}>
          {t('render.discussion.backToTopics')}
        </button>
        {topic.canManage && !topic.closed && (
          <button type="button" className="secondary" onClick={() => close.mutate()}>
            {t('render.discussion.close')}
          </button>
        )}
        {me?.isAdmin && (
          <SaveAsTemplate type="topic" sourceId={topic.id} defaultName={topic.title} />
        )}
        {me?.isAdmin && (
          <button
            type="button"
            className="danger"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(t('render.discussion.confirmDeleteTopic'))) remove.mutate();
            }}
          >
            {t('render.discussion.deleteTopic')}
          </button>
        )}
      </div>
      <ErrorMessage error={remove.error} />
      <h3>
        {topic.title}
        {topic.closed && <span className="badge"> {t('render.discussion.closed')}</span>}
      </h3>
      {messages.items.map((message) => (
        <Message key={message.id} message={message} onEdited={refresh} onDeleted={refresh} />
      ))}
      {pageCount > 1 && (
        <div className="pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t('common.previous')}
          </button>
          <span>{t('common.pageOf', { page, total: pageCount })}</span>
          <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
            {t('common.next')}
          </button>
        </div>
      )}
      {topic.closed ? (
        <p className="notice">{t('render.discussion.closedNotice')}</p>
      ) : (
        topic.canPost && (
          <Composer
            submitLabel={t('render.discussion.reply')}
            pending={reply.isPending}
            onSubmit={(content, attachmentIds) => reply.mutate({ content, attachmentIds })}
          />
        )
      )}
      <ErrorMessage error={reply.error} />
    </div>
  );
}

/** Espace de discussion (07) : liste des sujets et vue d'un sujet. */
export function DiscussionSpaceBlock({ block }: { block: AssembledDiscussionSpaceBlock }) {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const { name, canCreateTopic, canPost } = block.config;
  const [page, setPage] = useState(1);
  const [openTopicId, setOpenTopicId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');

  const topics = useQuery({
    queryKey: ['topics', block.topicsUrl, page],
    queryFn: () => listTopics(block.topicsUrl, page),
  });
  const pin = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => pinTopic(id, pinned),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['topics', block.topicsUrl] }),
  });
  const open = useMutation({
    mutationFn: (body: { title: string; firstMessage: string; attachmentIds: string[] }) =>
      openTopic(block.topicsUrl, body),
    onSuccess: (topic) => {
      setComposing(false);
      setTitle('');
      void queryClient.invalidateQueries({ queryKey: ['topics', block.topicsUrl] });
      setOpenTopicId(topic.id);
    },
  });

  if (openTopicId) {
    return (
      <section className="block-discussion">
        <TopicView topicId={openTopicId} onBack={() => setOpenTopicId(null)} />
      </section>
    );
  }

  return (
    <section className="block-discussion">
      <h3>{name}</h3>
      {topics.error && <ErrorMessage error={topics.error} />}
      {topics.data && topics.data.items.length === 0 && (
        <p className="muted">{t('render.discussion.noTopics')}</p>
      )}
      <ul className="topic-list">
        {topics.data?.items.map((topic) => (
          <li key={topic.id}>
            <button type="button" className="link" onClick={() => setOpenTopicId(topic.id)}>
              {topic.pinned && <span aria-hidden="true">📌 </span>}
              {topic.title}
            </button>
            <span className="muted">
              {topic.author.username} · {new Date(topic.lastActivityAt).toLocaleDateString('fr-FR')}
              {topic.closed && ` · ${t('render.discussion.closed')}`}
            </span>
            {me?.isAdmin && (
              <button
                type="button"
                className="secondary"
                onClick={() => pin.mutate({ id: topic.id, pinned: !topic.pinned })}
              >
                {topic.pinned ? t('render.discussion.unpin') : t('render.discussion.pin')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {topics.data && topics.data.total > topics.data.pageSize && (
        <div className="pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t('common.previous')}
          </button>
          <button
            type="button"
            disabled={page >= Math.ceil(topics.data.total / topics.data.pageSize)}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('common.next')}
          </button>
        </div>
      )}
      {canCreateTopic &&
        (composing ? (
          <Composer
            submitLabel={t('render.discussion.openTopic')}
            pending={open.isPending}
            title={{ value: title, onChange: setTitle }}
            onCancel={() => setComposing(false)}
            onSubmit={(firstMessage, attachmentIds) =>
              open.mutate({ title, firstMessage, attachmentIds })
            }
          />
        ) : (
          <button type="button" onClick={() => setComposing(true)}>
            {t('render.discussion.newTopic')}
          </button>
        ))}
      {!canCreateTopic && !canPost && <p className="muted">{t('render.discussion.readOnly')}</p>}
      <ErrorMessage error={open.error} />
    </section>
  );
}
