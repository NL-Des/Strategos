import {
  ALIGNMENTS,
  type Block,
  CHAT_HEIGHT_MAX,
  CHAT_HEIGHT_MIN,
  TOPIC_SORTS,
} from '@strategos/shared';
import { useTranslation } from 'react-i18next';
import { CatalogEditor, TableEditor } from './DataBlockEditors';
import { newId } from './defaults';
import { FormEditor } from './FormEditor';
import { LinkTargetEditor } from './LinkTargetEditor';
import { MediaPicker } from './MediaPicker';
import { RichTextEditor } from './RichTextEditor';

type Props<B extends Block> = { block: B; onChange: (block: B) => void };

function AlignSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: (typeof ALIGNMENTS)[number]) => void;
}) {
  const { t } = useTranslation();
  return (
    <label>
      {t('builder.align.label')}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as (typeof ALIGNMENTS)[number])}
      >
        {ALIGNMENTS.map((a) => (
          <option key={a} value={a}>
            {t(`builder.align.${a}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ImageEditor({ block, onChange }: Props<Extract<Block, { type: 'image' }>>) {
  const { t } = useTranslation();
  const config = block.config;
  const set = (patch: Partial<typeof config>) =>
    onChange({ ...block, config: { ...config, ...patch } });
  return (
    <div className="form">
      <MediaPicker
        value={config.mediaId}
        onChange={(mediaId, alt) => set({ mediaId, alt: config.alt || alt || '' })}
      />
      <label>
        {t('builder.image.alt')}
        <input value={config.alt} onChange={(e) => set({ alt: e.target.value })} />
      </label>
      <label>
        {t('builder.image.size')}
        <select
          value={config.size}
          onChange={(e) => set({ size: e.target.value as 'fit' | 'original' })}
        >
          <option value="fit">{t('builder.image.fit')}</option>
          <option value="original">{t('builder.image.original')}</option>
        </select>
      </label>
      <AlignSelect value={config.align} onChange={(align) => set({ align })} />
      <fieldset>
        <legend>{t('builder.image.link')}</legend>
        <LinkTargetEditor optional value={config.link} onChange={(link) => set({ link })} />
      </fieldset>
    </div>
  );
}

function ButtonsEditor({ block, onChange }: Props<Extract<Block, { type: 'buttons' }>>) {
  const { t } = useTranslation();
  const config = block.config;
  const set = (patch: Partial<typeof config>) =>
    onChange({ ...block, config: { ...config, ...patch } });
  const setButton = (i: number, patch: Partial<(typeof config.buttons)[number]>) =>
    set({ buttons: config.buttons.map((b, j) => (i === j ? { ...b, ...patch } : b)) });

  return (
    <div className="form">
      {config.buttons.map((button, i) => (
        <fieldset key={button.id}>
          <legend>{t('builder.buttons.button', { n: i + 1 })}</legend>
          <label>
            {t('builder.buttons.label')}
            <input value={button.label} onChange={(e) => setButton(i, { label: e.target.value })} />
          </label>
          <LinkTargetEditor
            value={button.target}
            onChange={(target) => target && setButton(i, { target })}
          />
          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={i === 0}
              onClick={() => {
                const buttons = [...config.buttons];
                [buttons[i - 1], buttons[i]] = [buttons[i]!, buttons[i - 1]!];
                set({ buttons });
              }}
            >
              {t('builder.moveUp')}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={config.buttons.length === 1}
              onClick={() => set({ buttons: config.buttons.filter((_, j) => j !== i) })}
            >
              {t('builder.remove')}
            </button>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className="secondary"
        onClick={() =>
          set({
            buttons: [
              ...config.buttons,
              { id: newId(), label: '', target: { kind: 'page', pageId: '' } },
            ],
          })
        }
      >
        {t('builder.buttons.add')}
      </button>
      <label>
        {t('builder.buttons.orientation')}
        <select
          value={config.orientation}
          onChange={(e) => set({ orientation: e.target.value as 'horizontal' | 'vertical' })}
        >
          <option value="horizontal">{t('builder.buttons.horizontal')}</option>
          <option value="vertical">{t('builder.buttons.vertical')}</option>
        </select>
      </label>
      <AlignSelect value={config.align} onChange={(align) => set({ align })} />
    </div>
  );
}

function DiscussionSpaceEditor({
  block,
  onChange,
}: Props<Extract<Block, { type: 'discussion_space' }>>) {
  const { t } = useTranslation();
  const config = block.config;
  const set = (patch: Partial<typeof config>) =>
    onChange({ ...block, config: { ...config, ...patch } });
  return (
    <div className="form">
      <p className="hint">{t('builder.discussionSpace.hint')}</p>
      <label>
        {t('builder.discussionSpace.name')}
        <input value={config.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label>
        {t('builder.discussionSpace.sortMode')}
        <select
          value={config.sortMode}
          onChange={(e) => set({ sortMode: e.target.value as (typeof TOPIC_SORTS)[number] })}
        >
          {TOPIC_SORTS.map((mode) => (
            <option key={mode} value={mode}>
              {t(`builder.discussionSpace.sort.${mode}`)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function ChatEditor({ block, onChange }: Props<Extract<Block, { type: 'chat' }>>) {
  const { t } = useTranslation();
  const config = block.config;
  const set = (patch: Partial<typeof config>) =>
    onChange({ ...block, config: { ...config, ...patch } });
  return (
    <div className="form">
      <p className="hint">{t('builder.chat.hint')}</p>
      <label>
        {t('builder.chat.name')}
        <input value={config.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label>
        {t('builder.chat.height')}
        <input
          type="number"
          min={CHAT_HEIGHT_MIN}
          max={CHAT_HEIGHT_MAX}
          value={config.height}
          onChange={(e) => set({ height: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}

/** Réglages d'un module, selon son type. */
export function BlockEditor({ block, onChange }: Props<Block>) {
  switch (block.type) {
    case 'image':
      return <ImageEditor block={block} onChange={onChange} />;
    case 'buttons':
      return <ButtonsEditor block={block} onChange={onChange} />;
    case 'rich_content':
      return (
        <RichTextEditor
          html={block.config.html}
          onChange={(html) => onChange({ ...block, config: { html } })}
        />
      );
    case 'table':
      return <TableEditor block={block} onChange={onChange} />;
    case 'catalog':
      return <CatalogEditor block={block} onChange={onChange} />;
    case 'form':
      return <FormEditor block={block} onChange={onChange} />;
    case 'discussion_space':
      return <DiscussionSpaceEditor block={block} onChange={onChange} />;
    case 'chat':
      return <ChatEditor block={block} onChange={onChange} />;
  }
}
