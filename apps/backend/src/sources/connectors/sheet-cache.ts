/**
 * Cache mémoire des sources connectées (08) : chaque feuille lue est gardée
 * 30 à 60 secondes, pour ne pas appeler l'API à chaque affichage. Il n'y a
 * aucune copie en base ; le cache est vidé par `source_id` après chaque écriture.
 */
export class SheetCache<T> {
  private readonly entries = new Map<string, { at: number; value: Promise<T> }>();

  constructor(
    private readonly ttlMs: () => number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Copie encore fraîche, sinon `load` ; des lectures simultanées partagent le même appel. */
  get(sourceId: string, sheet: string, load: () => Promise<T>): Promise<T> {
    const key = `${sourceId}|${sheet}`;
    const entry = this.entries.get(key);
    if (entry && this.now() - entry.at <= this.ttlMs()) return entry.value;
    const value = load();
    this.entries.set(key, { at: this.now(), value });
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    return value;
  }

  invalidate(sourceId: string): void {
    for (const key of this.entries.keys()) {
      if (key.startsWith(`${sourceId}|`)) this.entries.delete(key);
    }
  }
}
