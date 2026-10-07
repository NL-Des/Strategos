import { Injectable } from '@nestjs/common';
import { formulaToSheet, sheetSyntax } from '@strategos/shared';
import { config } from '../../config.js';
import type { Source } from '../../generated/prisma/client.js';
import { positionKey } from '../cell-format.js';
import { SourceUnavailableError } from '../source-errors.js';
import type { CellWrite } from '../source-write.service.js';
import { rawValue, scriptCell, type ScriptValue } from './cells.js';
import type { RemoteSheet, SourceConnector, SourceMetadata, SourceRef } from './connector.js';
import { SCRIPT_VERSION } from './gsheet-script.template.js';
import { decryptToken } from './token-crypto.js';

/** `connection_info` d'un Google Sheet relié par un script. */
export interface GsheetScriptInfo {
  /** Adresse du déploiement : `https://script.google.com/macros/s/<id>/exec`. */
  scriptUrl: string;
  /** Version du script déployé, relue à chaque test d'accès. */
  scriptVersion?: number;
  sheets?: string[];
}

/** Le script déployé est plus ancien que celui de Strategos : l'admin doit le recoller. */
export const scriptOutdated = (source: Pick<Source, 'connectionInfo'>) =>
  ((source.connectionInfo as unknown as GsheetScriptInfo).scriptVersion ?? 0) < SCRIPT_VERSION;

const SCRIPT_HOST = 'https://script.google.com';
/** Apps Script est lent : plusieurs secondes par appel sur un grand Sheet. */
const CALL_TIMEOUT_MS = 60_000;

interface ScriptReply {
  ok?: boolean;
  version?: number;
  name?: string;
  /** Langue du classeur (`fr_FR`) : elle fixe les séparateurs de ses formules. */
  locale?: string;
  sheets?: string[];
  values?: ScriptValue[][];
  formulas?: string[][];
}

/**
 * Google Sheet relié par un script Apps Script (08) : l'admin a collé dans son
 * Sheet le script fourni par Strategos et l'a déployé en application web.
 * Chaque appel présente le secret partagé. Une réponse qui n'est pas celle du
 * script (page de connexion, déploiement retiré, secret refusé) rend la source
 * injoignable.
 */
@Injectable()
export class GsheetScriptConnector implements SourceConnector {
  async metadata(source: SourceRef): Promise<SourceMetadata> {
    const reply = await this.call(source, { action: 'meta' });
    return {
      name: reply.name ?? '',
      sheets: reply.sheets ?? [],
      info: { scriptVersion: reply.version ?? 0 },
    };
  }

  async fetchSheet(source: Source, sheet: string): Promise<RemoteSheet> {
    const reply = await this.call(source, { action: 'read', sheet });
    const syntax = sheetSyntax(reply.locale);
    const cells: RemoteSheet = new Map();
    (reply.values ?? []).forEach((line, i) =>
      line.forEach((value, j) => {
        const cell = scriptCell(value, reply.formulas?.[i]?.[j], syntax);
        if (cell) cells.set(positionKey(i + 1, j + 1), cell);
      }),
    );
    return cells;
  }

  /**
   * Valeurs brutes : le script écrit tout texte tel quel, jamais comme une
   * formule. Une formule de la grille de l'admin part à part (`formula`), dans
   * la syntaxe de la langue du classeur.
   */
  async write(source: Source, writes: CellWrite[]): Promise<void> {
    const syntax = writes.some((w) => w.formula)
      ? sheetSyntax((await this.call(source, { action: 'meta' })).locale)
      : undefined;
    await this.call(source, {
      action: 'write',
      writes: writes.map((w) => ({
        sheet: w.sheet,
        row: w.row,
        col: w.col,
        ...(w.formula && syntax
          ? { formula: `=${formulaToSheet(w.formula, syntax)}` }
          : { value: rawValue(w.value) }),
      })),
    });
  }

  private async call(source: SourceRef, request: Record<string, unknown>): Promise<ScriptReply> {
    const { scriptUrl } = source.connectionInfo as unknown as GsheetScriptInfo;
    try {
      if (!source.connectionSecret) throw new SourceUnavailableError(source.id);
      const secret = decryptToken(config.tokenEncryptionKey, source.connectionSecret);
      // L'adresse enregistrée est toujours chez Google ; les tests visent un faux serveur.
      const response = await fetch(scriptUrl.replace(SCRIPT_HOST, config.apis.googleScript), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...request, secret }),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      const reply = (await response.json()) as ScriptReply;
      if (!response.ok || reply.ok !== true) throw new SourceUnavailableError(source.id);
      return reply;
    } catch {
      // Panne réseau, délai dépassé, réponse qui n'est pas du JSON, clé de chiffrement perdue.
      throw new SourceUnavailableError(source.id);
    }
  }
}
