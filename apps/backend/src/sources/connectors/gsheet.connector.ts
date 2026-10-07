import { Injectable } from '@nestjs/common';
import { cellRef, formulaToSheet, sheetSyntax } from '@strategos/shared';
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
  'properties.locale,sheets.data(startRow,startColumn,rowData.values(effectiveValue,userEnteredValue.formulaValue,effectiveFormat.numberFormat.type))';

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
    const body = await this.get<{
      properties?: { locale?: string };
      sheets?: { data?: GridData[] }[];
    }>(
      source,
      `?ranges=${encodeURIComponent(quoteSheet(sheet))}&includeGridData=true&fields=${encodeURIComponent(CELL_FIELDS)}`,
    );
    // Les formules arrivent avec les séparateurs de la langue du classeur.
    const syntax = sheetSyntax(body.properties?.locale);
    const cells: RemoteSheet = new Map();
    for (const grid of body.sheets?.[0]?.data ?? []) {
      (grid.rowData ?? []).forEach((rowData, i) => {
        (rowData.values ?? []).forEach((value, j) => {
          const cell = sheetsCell(value, syntax);
          const row = (grid.startRow ?? 0) + i + 1;
          const col = (grid.startColumn ?? 0) + j + 1;
          if (cell) cells.set(positionKey(row, col), cell);
        });
      });
    }
    return cells;
  }

  /**
   * Valeurs brutes (`RAW`) : un texte commençant par « = » n'est jamais une
   * formule. Une formule de la grille de l'admin part à part, comme une saisie
   * (`USER_ENTERED`), dans la syntaxe de la langue du classeur.
   */
  async write(source: Source, writes: CellWrite[]): Promise<void> {
    const formulas = writes.filter((w) => w.formula);
    const values = writes.filter((w) => !w.formula);
    if (values.length > 0) {
      await this.update(
        source,
        'RAW',
        values.map((w) => [w, rawValue(w.value)]),
      );
    }
    if (formulas.length > 0) {
      const { properties } = await this.get<{ properties?: { locale?: string } }>(
        source,
        '?fields=properties.locale',
      );
      const syntax = sheetSyntax(properties?.locale);
      await this.update(
        source,
        'USER_ENTERED',
        formulas.map((w) => [w, `=${formulaToSheet(w.formula!, syntax)}`]),
      );
    }
  }

  private async update(
    source: Source,
    valueInputOption: 'RAW' | 'USER_ENTERED',
    data: [CellWrite, string | number | boolean][],
  ): Promise<void> {
    await callApi(source.id, `${this.base(source)}/values:batchUpdate`, {
      method: 'POST',
      headers: await this.headers(source.id),
      body: JSON.stringify({
        valueInputOption,
        data: data.map(([w, value]) => ({
          range: `${quoteSheet(w.sheet)}!${cellRef(w)}`,
          values: [[value]],
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
