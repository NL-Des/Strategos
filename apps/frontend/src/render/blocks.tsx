import type {
  AssembledBlock,
  AssembledButtonsBlock,
  AssembledImageBlock,
  AssembledRichContentBlock,
} from '@strategos/shared';
import type { ComponentType } from 'react';
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

/** HTML nettoyé par le backend (liste blanche) avant d'être enregistré. */
function RichContentBlock({ block }: { block: AssembledRichContentBlock }) {
  return <div className="block-rich" dangerouslySetInnerHTML={{ __html: block.config.html }} />;
}

/** Registre des modules (06 — Points techniques) : un composant par type de bloc. */
const REGISTRY: {
  [K in AssembledBlock['type']]: ComponentType<{ block: Extract<AssembledBlock, { type: K }> }>;
} = {
  image: ImageBlock,
  buttons: ButtonsBlock,
  rich_content: RichContentBlock,
};

export function BlockRenderer({ block }: { block: AssembledBlock }) {
  const Component = REGISTRY[block.type] as ComponentType<{ block: AssembledBlock }>;
  return <Component block={block} />;
}
