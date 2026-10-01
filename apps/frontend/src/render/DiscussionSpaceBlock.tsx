import type {
  AssembledDiscussionSpaceBlock,
  AttachmentRef,
  TopicMessageView,
} from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router';
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
import { ActionMenu } from '../components/ActionMenu';
import { useConfirmed } from '../components/Dialog';
import { SaveAsTemplate } from '../components/SaveAsTemplate';
import { ErrorMessage } from '../components/ErrorMessage';
import { Notice } from '../components/Notice';
import { Pagination } from '../components/Pagination';
import { formatDate, formatDateTime } from '../format';
import { toHtml, toText } from './messageText';
import { Loading } from '../components/Loading';
import { Icon } from '../components/Icon';

/** Images jointes ; `onRemove` : pendant la saisie, chacune peut être retirée avant l'envoi. */
function Attachments({
  items,
  onRemove,
}: {
  items: AttachmentRef[];
  onRemove?: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <div className="message-attachments">
      {items.map((a, i) => (
        <span key={a.id} className="attachment">
          <a href={a.url} target="_blank" rel="noreferrer">
            <img src={a.url} alt={t('render.discussion.attachment', { n: i + 1 })} />
          </a>
          {onRemove && (
            <button
              type="button"
              className="secondary attachment-remove"
              aria-label={t('render.discussion.removeAttachment', { n: i + 1 })}
              onClick={() => onRemove(a.id)}
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

/** Paramètre d'adresse du sujet ouvert. */
const TOPIC_PARAM = 'sujet';

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
  /** La saisie n'est vidée qu'une fois l'envoi réussi : un refus ne fait rien perdre. */
  onSubmit: (content: string, attachmentIds: string[]) => Promise<unknown>;
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
    void onSubmit(
      html,
      attachments.map((a) => a.id),
    ).then(
      () => {
        setText('');
        setAttachments([]);
      },
      // L'erreur est affichée par l'appelant ; le texte et les images restent en place.
      () => undefined,
    );
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
      <Attachments
        items={attachments}
        onRemove={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
      />
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
  const confirmed = useConfirmed();
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
      <>
        <Composer
          submitLabel={t('common.save')}
          pending={edit.isPending}
          initial={toText(message.content)}
          onSubmit={(content) => edit.mutateAsync(content)}
          onCancel={() => setEditing(false)}
        />
        <ErrorMessage error={edit.error} />
      </>
    );
  }
  return (
    <article className={message.hidden ? 'topic-message hidden' : 'topic-message'}>
      <header>
        <strong>{message.author.username}</strong>
        <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
        {message.editedAt && <span className="muted"> · {t('render.discussion.edited')}</span>}
        {message.hidden && <span className="badge"> {t('render.discussion.hidden')}</span>}
      </header>
      <div className="message-body" dangerouslySetInnerHTML={{ __html: message.content }} />
      <Attachments items={message.attachments} />
      <ErrorMessage error={remove.error ?? moderate.error} />
      {(message.mine || me?.isAdmin) && (
        <ActionMenu label={t('render.discussion.messageOptions')}>
          {message.mine && (
            <>
              <button
                type="button"
                className="menu-item"
                role="menuitem"
                onClick={() => setEditing(true)}
              >
                {t('common.edit')}
              </button>
              <button
                type="button"
                className="menu-item"
                role="menuitem"
                onClick={() =>
                  confirmed(
                    {
                      title: t('render.discussion.confirmDelete'),
                      confirmLabel: t('common.delete'),
                      danger: true,
                    },
                    () => remove.mutate(),
                  )
                }
              >
                {t('common.delete')}
              </button>
            </>
          )}
          {me?.isAdmin && (
            <button
              type="button"
              className="menu-item"
              role="menuitem"
              onClick={() => moderate.mutate()}
            >
              {message.hidden ? t('render.discussion.unhide') : t('render.discussion.hide')}
            </button>
          )}
        </ActionMenu>
      )}
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
    // La réponse est en fin de sujet : on y va.
    onSuccess: () => {
      const data = query.data;
      if (data) setPage(Math.ceil((data.messages.total + 1) / data.messages.pageSize));
      void refresh();
    },
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
  const confirmed = useConfirmed();

  if (query.error) return <ErrorMessage error={query.error} />;
  if (!query.data) return <Loading />;
  const { topic, messages } = query.data;

  return (
    <div className="topic-view">
      <div className="actions">
        <button type="button" className="secondary" onClick={onBack}>
          <Icon name="arrowLeft" />
          {t('render.discussion.backToTopics')}
        </button>
        {me?.isAdmin && (
          <SaveAsTemplate type="topic" sourceId={topic.id} defaultName={topic.title} />
        )}
      </div>
      <ErrorMessage error={remove.error ?? close.error} />
      <div className="topic-heading">
        <h3>
          {topic.title}
          {topic.closed && <span className="badge"> {t('render.discussion.closed')}</span>}
        </h3>
        {((topic.canManage && !topic.closed) || me?.isAdmin) && (
          <ActionMenu label={t('render.discussion.topicOptions')}>
            {topic.canManage && !topic.closed && (
              <button
                type="button"
                className="menu-item"
                role="menuitem"
                onClick={() =>
                  confirmed(
                    {
                      title: t('render.discussion.confirmClose'),
                      confirmLabel: t('render.discussion.close'),
                    },
                    () => close.mutate(),
                  )
                }
              >
                {t('render.discussion.close')}
              </button>
            )}
            {me?.isAdmin && (
              <button
                type="button"
                className="menu-item danger"
                role="menuitem"
                disabled={remove.isPending}
                onClick={() =>
                  confirmed(
                    {
                      title: t('render.discussion.confirmDeleteTopic'),
                      confirmLabel: t('common.delete'),
                      danger: true,
                    },
                    () => remove.mutate(),
                  )
                }
              >
                {t('render.discussion.deleteTopic')}
              </button>
            )}
          </ActionMenu>
        )}
      </div>
      {messages.items.map((message) => (
        <Message key={message.id} message={message} onEdited={refresh} onDeleted={refresh} />
      ))}
      <Pagination
        page={page}
        total={messages.total}
        pageSize={messages.pageSize}
        onChange={setPage}
      />
      {topic.closed ? (
        <Notice tone="info">{t('render.discussion.closedNotice')}</Notice>
      ) : (
        topic.canPost && (
          <Composer
            submitLabel={t('render.discussion.reply')}
            pending={reply.isPending}
            onSubmit={(content, attachmentIds) => reply.mutateAsync({ content, attachmentIds })}
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
  // Le sujet ouvert est dans l'adresse (`?sujet=<espace>.<sujet>`) : on peut le
  // partager, recharger la page et revenir à la liste par « Précédent ».
  const [params, setParams] = useSearchParams();
  const [openBlock, openTopicId] = (params.get(TOPIC_PARAM) ?? '').split('.');
  const setOpenTopicId = (topicId: string | null) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (topicId) next.set(TOPIC_PARAM, `${block.id}.${topicId}`);
      else next.delete(TOPIC_PARAM);
      return next;
    });
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

  if (openBlock === block.id && openTopicId) {
    return (
      <section className="block-discussion">
        <TopicView topicId={openTopicId} onBack={() => setOpenTopicId(null)} />
      </section>
    );
  }

  return (
    <section className="block-discussion">
      <h3>{name}</h3>
      <ErrorMessage error={topics.error ?? pin.error} />
      {topics.isPending && <Loading />}
      {topics.data && topics.data.items.length === 0 && (
        <p className="muted">{t('render.discussion.noTopics')}</p>
      )}
      <ul className="topic-list">
        {topics.data?.items.map((topic) => (
          <li key={topic.id}>
            <button type="button" className="link" onClick={() => setOpenTopicId(topic.id)}>
              {topic.pinned && <Icon name="pin" size={15} />} {topic.title}
            </button>
            <span className="muted">
              {topic.author.username} · {formatDate(topic.lastActivityAt)}
              {topic.closed && ` · ${t('render.discussion.closed')}`}
            </span>
            {me?.isAdmin && (
              <ActionMenu label={t('render.discussion.topicOptions')}>
                <button
                  type="button"
                  className="menu-item"
                  role="menuitem"
                  onClick={() => pin.mutate({ id: topic.id, pinned: !topic.pinned })}
                >
                  {topic.pinned ? t('render.discussion.unpin') : t('render.discussion.pin')}
                </button>
              </ActionMenu>
            )}
          </li>
        ))}
      </ul>
      {topics.data && (
        <Pagination
          page={page}
          total={topics.data.total}
          pageSize={topics.data.pageSize}
          onChange={setPage}
        />
      )}
      {canCreateTopic &&
        (composing ? (
          <Composer
            submitLabel={t('render.discussion.openTopic')}
            pending={open.isPending}
            title={{ value: title, onChange: setTitle }}
            onCancel={() => setComposing(false)}
            onSubmit={(firstMessage, attachmentIds) =>
              open.mutateAsync({ title, firstMessage, attachmentIds })
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
