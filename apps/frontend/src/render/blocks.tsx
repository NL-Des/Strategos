import type {
  AssembledBlock,
  AssembledButtonsBlock,
  AssembledImageBlock,
  AssembledRichContentBlock,
} from '@strategos/shared';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogBlock, SourceUnavailable, TableBlock } from './DataBlocks';
import { FormBlock } from './FormBlock';
import { LinkTo } from './LinkTo';

function ImageBlock({ block }: { block: AssembledImageBlock }) {
  const { src, alt, size, align, link } = block.config;
  const image = <img src={src} alt={alt} className={`block-image size-${size}`} />;
  return (
    <div className={`align-${align}`}>{link ? <LinkTo link={link}>{image}</LinkTo> : image}</div>
  );
}

function ButtonsBlock({ block }: { block: AssembledButtonsBlock }) {
  const { buttons, orientation, align } = block.config;
  return (
    <nav className={`block-buttons ${orientation} align-${align}`}>
      {buttons.map((b) => (
        <LinkTo key={b.id} link={b.link} className="theme-button">
          {b.label}
        </LinkTo>
      ))}
    </nav>
  );
}

/**
 * HTML nettoyé par le backend (liste blanche) avant d'être enregistré. Les
 * valeurs de cellules, déjà résolues, remplacent leurs emplacements
 * `<span data-value="i">` ; le texte est échappé.
 */
function RichContentBlock({ block }: { block: AssembledRichContentBlock }) {
  const { t } = useTranslation();
  const html = block.config.html.replace(/<span data-value="(\d+)"><\/span>/g, (_, i: string) => {
    const value = block.config.values[Number(i)];
    if (!value) return '';
    const mark = value.needsRecalc
      ? `<span class="needs-recalc" title="${escapeHtml(t('render.needsRecalc'))}">*</span>`
      : '';
    return `<span class="cell-value">${escapeHtml(value.value)}</span>${mark}`;
  });
  return (
    <>
      {block.error && <SourceUnavailable />}
      <div className="block-rich" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Registre des modules (06 — Points techniques) : un composant par type de bloc. */
const REGISTRY: {
  [K in AssembledBlock['type']]: ComponentType<{ block: Extract<AssembledBlock, { type: K }> }>;
} = {
  image: ImageBlock,
  buttons: ButtonsBlock,
  rich_content: RichContentBlock,
  table: TableBlock,
  catalog: CatalogBlock,
  form: FormBlock,
};

export function BlockRenderer({ block }: { block: AssembledBlock }) {
  const Component = REGISTRY[block.type] as ComponentType<{ block: AssembledBlock }>;
  return <Component block={block} />;
}
