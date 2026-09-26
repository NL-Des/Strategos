/** Destination d'un bouton, d'une image ou d'une zone de carte (06 — Destinations des liens). */
export type LinkKind = 'page' | 'url' | 'personal_page';

export interface LinkTarget {
  kind: LinkKind;
  /** Renseigné si `kind = page`. */
  pageId?: string;
  /** Renseigné si `kind = url`. */
  url?: string;
}

/**
 * Lien après assemblage : « Ma page personnelle » est résolue en page, et un lien
 * vers une page illisible a déjà été retiré (06 — Liens vers des pages non autorisées).
 */
export type ResolvedLink = { kind: 'page'; pageId: string } | { kind: 'url'; url: string };
