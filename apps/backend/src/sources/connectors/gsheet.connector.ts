import { Injectable } from '@nestjs/common';
import { cellRef } from '@strategos/shared';
import { config } from '../../config.js';
import type { Source } from '../../generated/prisma/client.js';
import { positionKey } from '../cell-format.js';
import type { CellWrite } from '../source-write.service.js';
import { quoteSheet, rawValue, type SheetsCellData, sheetsCell } from './cells.js';
import {
  callApi,
  type RemoteSheet,
  type SourceConnector,
  type SourceMetadata,
} from './connector.js';
import { GoogleAuthService } from './google-auth.service.js';

/** `connection_info` d'un Google Sheet. */
export interface GsheetInfo {
  spreadsheetId: string;
  sheets?: string[];
}

interface GridData {
  startRow?: number;
  startColumn?: number;
  rowData?: { values?: SheetsCellData[] }[];
}

const CELL_FIELDS =
  'sheets.data(startRow,startColumn,rowData.values(effectiveValue,userEnteredValue.formulaValue,effectiveFormat.numberFormat.type))';

/**
 * Google Sheets (08) : API v4, avec l'accès délégué de l'admin, limité aux
 * fichiers qu'il a choisis. Tout autre Sheet répond `403` ou `404` : la source
 * est injoignable.
 */
@Injectable()
export class GsheetConnector implements SourceConnector {
  constructor(private readonly auth: GoogleAuthService) {}

  async metadata(source: Pick<Source, 'id' | 'connectionInfo'>): Promise<SourceMetadata> {
    const body = await this.get<{
      properties: { title: string };
      sheets: { properties: { title: string } }[];
    }>(source, '?fields=properties.title,sheets.properties.title');
    return { name: body.properties.title, sheets: body.sheets.map((s) => s.properties.title) };
  }

  async fetchSheet(source: Source, sheet: string): Promise<RemoteSheet> {
    const body = await this.get<{ sheets?: { data?: GridData[] }[] }>(
      source,
      `?ranges=${encodeURIComponent(quoteSheet(sheet))}&includeGridData=true&fields=${encodeURIComponent(CELL_FIELDS)}`,
    );
    const cells: RemoteSheet = new Map();
    for (const grid of body.sheets?.[0]?.data ?? []) {
      (grid.rowData ?? []).forEach((rowData, i) => {
        (rowData.values ?? []).forEach((value, j) => {
          const cell = sheetsCell(value);
          const row = (grid.startRow ?? 0) + i + 1;
          const col = (grid.startColumn ?? 0) + j + 1;
          if (cell) cells.set(positionKey(row, col), cell);
        });
      });
    }
    return cells;
  }

  /** Valeurs brutes (`RAW`) : un texte commençant par « = » n'est jamais une formule. */
  async write(source: Source, writes: CellWrite[]): Promise<void> {
    await callApi(source.id, `${this.base(source)}/values:batchUpdate`, {
      method: 'POST',
      headers: await this.headers(source.id),
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: writes.map((w) => ({
          range: `${quoteSheet(w.sheet)}!${cellRef(w)}`,
          values: [[rawValue(w.value)]],
        })),
      }),
    });
  }

  private base(source: Pick<Source, 'connectionInfo'>): string {
    const { spreadsheetId } = source.connectionInfo as unknown as GsheetInfo;
    return `${config.apis.sheets}/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  }

  private async headers(sourceId: string) {
    return {
      Authorization: `Bearer ${await this.auth.accessToken(sourceId)}`,
      'Content-Type': 'application/json',
    };
  }

  private async get<T>(source: Pick<Source, 'id' | 'connectionInfo'>, query: string): Promise<T> {
    return callApi<T>(source.id, `${this.base(source)}${query}`, {
      headers: await this.headers(source.id),
    });
  }
}
