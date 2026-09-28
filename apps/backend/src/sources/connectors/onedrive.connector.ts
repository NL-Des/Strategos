import { Injectable } from '@nestjs/common';
import { CellType, cellRef, type OneDriveItem } from '@strategos/shared';
import { config } from '../../config.js';
import type { Source } from '../../generated/prisma/client.js';
import { positionKey } from '../cell-format.js';
import type { CellWrite } from '../source-write.service.js';
import { graphCell, rawValue } from './cells.js';
import {
  callApi,
  type RemoteSheet,
  type SourceConnector,
  type SourceMetadata,
} from './connector.js';
import { OneDriveAuthService } from './onedrive-auth.service.js';

/** `connection_info` d'un fichier OneDrive. */
export interface OneDriveInfo {
  driveId: string;
  itemId: string;
  sheets?: string[];
}

interface UsedRange {
  address: string;
  values: unknown[][];
  valueTypes: string[][];
  formulas: unknown[][];
  numberFormat: unknown[][];
}

/** « Stock!B3:F20 » → coin haut-gauche. */
function topLeft(address: string): { row: number; col: number } {
  const m = /!?\$?([A-Z]+)\$?(\d+)(?::|$)/.exec(address.split('!').pop() ?? '');
  if (!m) return { row: 1, col: 1 };
  let col = 0;
  for (const c of m[1]!) col = col * 26 + c.charCodeAt(0) - 64;
  return { row: Number(m[2]), col };
}

/**
 * OneDrive / SharePoint (08) : API Graph `workbook`, avec l'accès délégué de
 * l'admin. Le fichier en ligne fait foi ; Microsoft recalcule après chaque écriture.
 */
@Injectable()
export class OneDriveConnector implements SourceConnector {
  constructor(private readonly auth: OneDriveAuthService) {}

  async metadata(source: Pick<Source, 'id' | 'connectionInfo'>): Promise<SourceMetadata> {
    const { driveId, itemId } = source.connectionInfo as unknown as OneDriveInfo;
    const item = await this.get<{ name: string }>(
      source.id,
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=name`,
    );
    const sheets = await this.get<{ value: { name: string }[] }>(
      source.id,
      `${this.workbook(source)}/worksheets?$select=name`,
    );
    return { name: item.name, sheets: sheets.value.map((s) => s.name) };
  }

  async fetchSheet(source: Source, sheet: string): Promise<RemoteSheet> {
    const range = await this.get<UsedRange>(
      source.id,
      `${this.worksheet(source, sheet)}/usedRange?$select=address,values,valueTypes,formulas,numberFormat`,
    );
    const start = topLeft(range.address);
    const cells: RemoteSheet = new Map();
    range.values.forEach((line, i) =>
      line.forEach((value, j) => {
        const cell = graphCell(
          value,
          range.valueTypes[i]?.[j] ?? 'Empty',
          range.formulas[i]?.[j],
          range.numberFormat[i]?.[j],
        );
        if (cell) cells.set(positionKey(start.row + i, start.col + j), cell);
      }),
    );
    return cells;
  }

  /** Valeurs brutes : un texte qui ressemblerait à une formule est écrit comme texte. */
  async write(source: Source, writes: CellWrite[]): Promise<void> {
    for (const w of writes) {
      let value = rawValue(w.value);
      if (w.value.type === CellType.text && typeof value === 'string' && /^[=+\-@]/.test(value)) {
        value = `'${value}`;
      }
      await callApi(
        source.id,
        `${config.apis.graph}${this.worksheet(source, w.sheet)}/range(address='${cellRef(w)}')`,
        {
          method: 'PATCH',
          headers: await this.headers(source.id),
          body: JSON.stringify({ values: [[value]] }),
        },
      );
    }
  }

  /** Fichier choisi dans le OneDrive connecté → `connection_info` (le `driveId` est retrouvé). */
  async locate(itemId: string): Promise<OneDriveInfo> {
    const item = await this.get<{ id: string; parentReference?: { driveId?: string } }>(
      'onedrive',
      `/me/drive/items/${encodeURIComponent(itemId)}?$select=id,parentReference`,
    );
    return { driveId: item.parentReference?.driveId ?? '', itemId: item.id };
  }

  /** Dossier du OneDrive connecté, pour choisir un fichier `.xlsx`. */
  async browse(path: string): Promise<OneDriveItem[]> {
    const clean = path.replace(/^\/+|\/+$/g, '');
    const target = clean
      ? `/me/drive/root:/${encodeURI(clean)}:/children`
      : '/me/drive/root/children';
    const body = await this.get<{ value: { id: string; name: string; folder?: object }[] }>(
      'onedrive',
      `${target}?$select=id,name,folder,file`,
    );
    return body.value
      .filter((item) => item.folder || item.name.toLowerCase().endsWith('.xlsx'))
      .map((item) => ({
        id: item.id,
        name: item.name,
        folder: !!item.folder,
        path: clean ? `${clean}/${item.name}` : item.name,
      }));
  }

  private workbook(source: Pick<Source, 'connectionInfo'>): string {
    const { driveId, itemId } = source.connectionInfo as unknown as OneDriveInfo;
    return `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/workbook`;
  }

  private worksheet(source: Source, sheet: string): string {
    return `${this.workbook(source)}/worksheets('${encodeURIComponent(sheet.replaceAll("'", "''"))}')`;
  }

  private async headers(sourceId: string) {
    return {
      Authorization: `Bearer ${await this.auth.accessToken(sourceId)}`,
      'Content-Type': 'application/json',
    };
  }

  private async get<T>(sourceId: string, path: string): Promise<T> {
    return callApi<T>(sourceId, `${config.apis.graph}${path}`, {
      headers: await this.headers(sourceId),
    });
  }
}
