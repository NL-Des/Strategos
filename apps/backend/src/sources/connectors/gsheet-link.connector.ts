import { Injectable } from '@nestjs/common';
import { EXCEL_MAX_BYTES } from '@strategos/shared';
import { fileTypeFromBuffer } from 'file-type';
import { config } from '../../config.js';
import type { Source } from '../../generated/prisma/client.js';
import { positionKey } from '../cell-format.js';
import { type ParsedWorkbook, parseWorkbook } from '../excel-parser.js';
import { sourceReadOnly, SourceUnavailableError } from '../source-errors.js';
import type { RemoteSheet, SourceConnector, SourceMetadata } from './connector.js';
import type { GsheetInfo } from './gsheet.connector.js';
import { SheetCache } from './sheet-cache.js';

/** Délai maximal du téléchargement d'un Sheet. */
const DOWNLOAD_TIMEOUT_MS = 30_000;
const DEFAULT_NAME = 'Google Sheet';

interface Download {
  name: string;
  workbook: ParsedWorkbook;
}

/** Titre du Sheet, lu dans `Content-Disposition` (`filename*=UTF-8''Stock.xlsx`). */
export function downloadName(disposition: string | null): string {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? '')?.[1];
  const plain = /filename="([^"]+)"/i.exec(disposition ?? '')?.[1];
  let name = plain ?? '';
  try {
    if (encoded) name = decodeURIComponent(encoded);
  } catch {
    // Nom mal encodé : celui de `filename`, ou le nom par défaut.
  }
  return name.replace(/\.xlsx$/i, '').trim() || DEFAULT_NAME;
}

/**
 * Google Sheet partagé par lien public (08) : téléchargé au format Excel par son
 * adresse publique, sans compte Google, puis lu comme un classeur. Lecture
 * seule. Un Sheet qui n'est pas partagé par lien répond par la page de
 * connexion de Google : la source est injoignable.
 */
@Injectable()
export class GsheetLinkConnector implements SourceConnector {
  /** Un téléchargement sert toutes les feuilles du Sheet. */
  private readonly downloads = new SheetCache<Download>(() => config.sourceCacheMs);

  async metadata(source: Pick<Source, 'id' | 'connectionInfo'>): Promise<SourceMetadata> {
    const { name, workbook } = await this.fetch(source);
    return { name, sheets: workbook.sheets.map((s) => s.name) };
  }

  async fetchSheet(source: Source, sheet: string): Promise<RemoteSheet> {
    const { workbook } = await this.downloads.get(source.id, '', () => this.fetch(source));
    const cells: RemoteSheet = new Map();
    for (const c of workbook.sheets.find((s) => s.name === sheet)?.cells ?? []) {
      cells.set(positionKey(c.row, c.col), {
        type: c.type,
        text: c.text,
        number: c.number,
        needsRecalc: false,
        formula: c.formula,
      });
    }
    return cells;
  }

  write(): Promise<void> {
    return Promise.reject(sourceReadOnly());
  }

  invalidate(sourceId: string): void {
    this.downloads.invalidate(sourceId);
  }

  private async fetch(source: Pick<Source, 'id' | 'connectionInfo'>): Promise<Download> {
    const { spreadsheetId } = source.connectionInfo as unknown as GsheetInfo;
    const url = `${config.apis.googleExport}/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export?format=xlsx`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      if (!response.ok) throw new SourceUnavailableError(source.id);
      if (Number(response.headers.get('content-length') ?? 0) > EXCEL_MAX_BYTES) {
        throw new SourceUnavailableError(source.id);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const detected = await fileTypeFromBuffer(buffer);
      if (buffer.length > EXCEL_MAX_BYTES || detected?.ext !== 'xlsx') {
        throw new SourceUnavailableError(source.id);
      }
      return {
        name: downloadName(response.headers.get('content-disposition')),
        workbook: await parseWorkbook(buffer),
      };
    } catch {
      // Panne réseau, délai dépassé, Sheet non partagé ou classeur illisible.
      throw new SourceUnavailableError(source.id);
    }
  }
}
