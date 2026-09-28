import type { Block, Row } from '@strategos/shared';
import { createContext, useContext } from 'react';

/**
 * Page en cours d'édition : les formulaires y sont rattachés, et un formulaire
 * de ligne se relie à un Tableau ou un Catalogue de son brouillon. Absent dans
 * le header et le footer partagés, qui n'acceptent pas de formulaire.
 */
export interface PageEditorContextValue {
  pageId: string;
  blocks: Block[];
}

export const PageEditorContext = createContext<PageEditorContextValue | null>(null);

export const usePageEditor = () => useContext(PageEditorContext);

export function blocksOf(zones: (Row[] | null)[]): Block[] {
  return zones.flatMap((rows) =>
    (rows ?? []).flatMap((r) => r.columns.flatMap((c) => (c.block ? [c.block] : []))),
  );
}
