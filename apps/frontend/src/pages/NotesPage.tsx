import { NOTE_TITLE_MAX_LENGTH, type Note } from '@strategos/shared';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createNote, deleteNote, listNotes, type NoteInput, updateNote } from '../api/notes';
import { useConfirmed, usePrompt } from '../components/Dialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { Notice } from '../components/Notice';
import { formatDateTime } from '../format';
import { useDocumentTitle } from '../useDocumentTitle';
import { useToast } from '../components/Toast';
import { ToolButton } from '../components/ToolButton';
import { EmptyState } from '../components/EmptyState';

const NOTES_KEY = ['me', 'notes'];

/**
 * Notes personnelles (05) : hors page builder, accessibles par le menu de
 * compte. Une mention permanente rappelle que l'administrateur peut les lire.
 */
export function NotesPage() {
  const { t } = useTranslation();
  const notes = useQuery({ queryKey: NOTES_KEY, queryFn: listNotes });
  const [creating, setCreating] = useState(false);
  useDocumentTitle(t('notes.title'));

  return (
    <section>
      <h1>{t('notes.title')}</h1>
      <Notice tone="info">{t('notes.visibleByAdmin')}</Notice>
      <ErrorMessage error={notes.error} />
      {notes.isPending && <Loading />}
      {creating ? (
        <NoteForm onDone={() => setCreating(false)} />
      ) : (
        <button type="button" onClick={() => setCreating(true)}>
          {t('notes.new')}
        </button>
      )}
      {notes.data?.length === 0 && !creating && <EmptyState>{t('notes.empty')}</EmptyState>}
      {notes.data?.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}
    </section>
  );
}

function NoteCard({ note }: { note: Note }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const confirmed = useConfirmed();
  const remove = useMutation({
    mutationFn: () => deleteNote(note.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: NOTES_KEY }),
  });

  if (editing) return <NoteForm note={note} onDone={() => setEditing(false)} />;
  return (
    <article className="card note">
      <h2>{note.title}</h2>
      <p className="muted">{t('notes.updatedAt', { date: formatDateTime(note.updatedAt) })}</p>
      {/* HTML nettoyé par le backend (liste blanche). */}
      <div className="block-rich" dangerouslySetInnerHTML={{ __html: note.content }} />
      <ErrorMessage error={remove.error} />
      <div className="actions">
        <button type="button" className="secondary" onClick={() => setEditing(true)}>
          {t('common.edit')}
        </button>
        <button
          type="button"
          className="danger"
          disabled={remove.isPending}
          onClick={() =>
            confirmed(
              {
                title: t('notes.deleteConfirm', { title: note.title }),
                confirmLabel: t('common.delete'),
                danger: true,
              },
              () => remove.mutate(),
            )
          }
        >
          {t('common.delete')}
        </button>
      </div>
    </article>
  );
}

/** Création (sans `note`) ou modification d'une note. */
function NoteForm({ note, onDone }: { note?: Note; onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(note?.title ?? '');
  const [content, setContent] = useState(note?.content ?? '');
  const toast = useToast();
  const confirmed = useConfirmed();
  const changed = title !== (note?.title ?? '') || content !== (note?.content ?? '');
  const save = useMutation({
    mutationFn: (body: NoteInput) => (note ? updateNote(note.id, body) : createNote(body)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTES_KEY });
      toast(t('notes.saved'));
      onDone();
    },
  });

  return (
    <form
      className="card form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate({ title, content });
      }}
    >
      <label>
        {t('fields.title')}
        <input
          required
          maxLength={NOTE_TITLE_MAX_LENGTH}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <NoteEditor html={content} onChange={setContent} />
      <ErrorMessage error={save.error} />
      <div className="actions">
        <button type="submit" disabled={save.isPending}>
          {note ? t('common.save') : t('notes.create')}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            // Une saisie modifiée ne se perd pas sur un clic machinal.
            changed
              ? confirmed(
                  { title: t('notes.discardConfirm'), confirmLabel: t('notes.discard') },
                  onDone,
                )
              : onDone()
          }
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

/** Mise en forme simple (05) : gras, italique, listes, liens. */
function NoteEditor({ html, onChange }: { html: string; onChange: (html: string) => void }) {
  const { t } = useTranslation();
  const prompt = usePrompt();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
      }),
    ],
    content: html,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      link: e.isActive('link'),
    }),
  });

  const chain = () => editor.chain().focus();
  const tool = (key: keyof typeof state, label: string, run: () => void) => (
    <ToolButton label={label} active={state[key]} onClick={run} />
  );

  return (
    <div className="rich-editor">
      <div className="toolbar" role="toolbar" aria-label={t('fields.content')}>
        {tool('bold', t('notes.editor.bold'), () => chain().toggleBold().run())}
        {tool('italic', t('notes.editor.italic'), () => chain().toggleItalic().run())}
        {tool('bullet', t('notes.editor.bulletList'), () => chain().toggleBulletList().run())}
        {tool('ordered', t('notes.editor.orderedList'), () => chain().toggleOrderedList().run())}
        {tool('link', t('notes.editor.link'), () => {
          if (state.link) return chain().unsetLink().run();
          void prompt({
            title: t('notes.editor.link'),
            label: t('notes.editor.linkPrompt'),
            initial: 'https://',
          }).then((url) => {
            if (url) chain().setLink({ href: url, target: '_blank' }).run();
          });
        })}
      </div>
      <EditorContent editor={editor} className="rich-editor-content block-rich" />
    </div>
  );
}
