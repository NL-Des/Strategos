import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { CELL_REF_PATTERN, INLINE_CELL_FORMATS, type InlineCellFormat } from '@strategos/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrompt } from '../components/Dialog';
import { ToolButton } from '../components/ToolButton';
import { CellValue, type CellValueAttrs } from './CellValueNode';
import { useSources } from './DataBlockEditors';
import { MediaPicker } from './MediaPicker';

/** « Insérer une valeur » (06) : source, feuille, cellule et format. */
function CellValuePicker({ onInsert }: { onInsert: (attrs: CellValueAttrs) => void }) {
  const { t } = useTranslation();
  const sources = useSources();
  const [source, setSource] = useState('');
  const [sheet, setSheet] = useState('');
  const [ref, setRef] = useState('');
  const [format, setFormat] = useState<InlineCellFormat>('text');
  const sheets = sources.data?.find((s) => s.id === source)?.sheets ?? [];
  const valid = !!source && !!sheet && CELL_REF_PATTERN.test(ref);

  return (
    <div className="card form cell-value-picker">
      <label>
        {t('builder.data.sourceFile')}
        <select
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setSheet(sources.data?.find((s) => s.id === e.target.value)?.sheets[0] ?? '');
          }}
        >
          <option value="">{t('builder.data.chooseSource')}</option>
          {sources.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('builder.data.sheet')}
        <select value={sheet} onChange={(e) => setSheet(e.target.value)}>
          {sheets.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('builder.data.cell')}
        <input
          value={ref}
          placeholder="B2"
          onChange={(e) => setRef(e.target.value.toUpperCase())}
        />
      </label>
      <label>
        {t('builder.data.format')}
        <select value={format} onChange={(e) => setFormat(e.target.value as InlineCellFormat)}>
          {INLINE_CELL_FORMATS.map((f) => (
            <option key={f} value={f}>
              {t(`builder.data.formats.${f}`)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!valid}
        onClick={() => onInsert({ source, sheet, ref, format })}
      >
        {t('builder.rich.insertValue')}
      </button>
    </div>
  );
}

/**
 * Éditeur du Contenu libre : titres, gras, italique, listes, liens, tableaux
 * simples, images de la médiathèque et valeurs de cellules. Le backend nettoie
 * le HTML produit.
 */
export function RichTextEditor({
  html,
  onChange,
}: {
  html: string;
  onChange: (html: string) => void;
}) {
  const { t } = useTranslation();
  const prompt = usePrompt();
  const [picking, setPicking] = useState(false);
  const [insertingValue, setInsertingValue] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, code: false, codeBlock: false }),
      Image,
      TableKit.configure({ table: { resizable: false } }),
      CellValue,
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
    <ToolButton label={label} active={state[key]} onClick={run} />
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
          void prompt({
            title: t('builder.rich.link'),
            label: t('builder.rich.linkPrompt'),
            initial: 'https://',
          }).then((url) => {
            if (url) chain().setLink({ href: url, target: '_blank' }).run();
          });
        })}
        <ToolButton
          label={t('builder.rich.table')}
          onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        />
        <ToolButton
          label={t('builder.rich.image')}
          active={picking}
          onClick={() => setPicking(!picking)}
        />
        <ToolButton
          label={t('builder.rich.value')}
          active={insertingValue}
          onClick={() => setInsertingValue(!insertingValue)}
        />
      </div>
      {insertingValue && (
        <CellValuePicker
          onInsert={(attrs) => {
            chain().insertCellValue(attrs).run();
            setInsertingValue(false);
          }}
        />
      )}
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
