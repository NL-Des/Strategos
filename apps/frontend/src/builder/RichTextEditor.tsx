import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MediaPicker } from './MediaPicker';

/**
 * Éditeur du Contenu libre : titres, gras, italique, listes, liens, tableaux
 * simples et images de la médiathèque. Le backend nettoie le HTML produit.
 */
export function RichTextEditor({
  html,
  onChange,
}: {
  html: string;
  onChange: (html: string) => void;
}) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, code: false, codeBlock: false }),
      Image,
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: html,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      link: e.isActive('link'),
    }),
  });

  const chain = () => editor.chain().focus();
  const tool = (key: keyof typeof state, label: string, run: () => void) => (
    <button
      type="button"
      className={`tool${state[key] ? ' active' : ''}`}
      aria-pressed={state[key]}
      onClick={run}
    >
      {label}
    </button>
  );

  return (
    <div className="rich-editor">
      <div className="toolbar" role="toolbar" aria-label={t('builder.rich.toolbar')}>
        {tool('h2', t('builder.rich.h2'), () => chain().toggleHeading({ level: 2 }).run())}
        {tool('h3', t('builder.rich.h3'), () => chain().toggleHeading({ level: 3 }).run())}
        {tool('bold', t('builder.rich.bold'), () => chain().toggleBold().run())}
        {tool('italic', t('builder.rich.italic'), () => chain().toggleItalic().run())}
        {tool('bullet', t('builder.rich.bulletList'), () => chain().toggleBulletList().run())}
        {tool('ordered', t('builder.rich.orderedList'), () => chain().toggleOrderedList().run())}
        {tool('link', t('builder.rich.link'), () => {
          if (state.link) return chain().unsetLink().run();
          const url = window.prompt(t('builder.rich.linkPrompt'), 'https://');
          if (url) chain().setLink({ href: url, target: '_blank' }).run();
        })}
        <button
          type="button"
          className="tool"
          onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          {t('builder.rich.table')}
        </button>
        <button type="button" className="tool" onClick={() => setPicking(!picking)}>
          {t('builder.rich.image')}
        </button>
      </div>
      {picking && (
        <MediaPicker
          value=""
          onChange={(mediaId, alt) => {
            chain()
              .setImage({ src: `/api/v1/media/${mediaId}`, alt: alt ?? '' })
              .run();
            setPicking(false);
          }}
        />
      )}
      <EditorContent editor={editor} className="rich-editor-content block-rich" />
    </div>
  );
}
