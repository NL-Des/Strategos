import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { cellRef, columnNumber, EXCEL_MIME } from '@strategos/shared';
import { buildXlsx } from './xlsx.js';

/**
 * Faux serveur des API Google (OAuth, Sheets v4, téléchargement d'un Sheet
 * public, script Apps Script) et Microsoft (OAuth, Graph `workbook`), pour tester les sources
 * connectées sans compte réel. Les feuilles sont `{ A1: valeur }` ; une formule s'écrit
 * `{ f: '=C2*D2', v: 200 }`, une date `{ date: 46291 }`.
 */
export type FakeValue =
  string | number | boolean | { f: string; v: number | string } | { date: number };
export type FakeSheets = Record<string, Record<string, FakeValue>>;

interface FakeSpreadsheet {
  title: string;
  /** L'admin a choisi ce Sheet dans le sélecteur : l'application y a accès (`drive.file`). */
  picked: boolean;
  sheets: FakeSheets;
}

/** Google Sheet atteint par son lien, sans compte : classeur `{ Feuille: { A1: valeur } }`. */
interface FakeLinkedSheet {
  title: string;
  /** Partagé en « toute personne disposant du lien ». */
  shared: boolean;
  sheets: Parameters<typeof buildXlsx>[0];
}

/** Script Apps Script déployé dans un Sheet (protocole de `gsheet-script.template.ts`). */
interface FakeScript {
  secret: string;
  version: number;
  title: string;
  sheets: FakeSheets;
}

interface FakeWorkbook {
  name: string;
  sheets: FakeSheets;
}

/** Compte Google de l'admin connecté par le faux serveur. */
export const GOOGLE_ACCOUNT = 'nadia@exemple.fr';

function parseRef(ref: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
  return { row: Number(m[2]), col: columnNumber(m[1]!) };
}

/** Grille `[ligne][colonne]` à partir de A1, jusqu'à la dernière cellule remplie. */
function grid(cells: Record<string, FakeValue>): (FakeValue | undefined)[][] {
  const entries = Object.entries(cells).map(([ref, v]) => ({ ...parseRef(ref), v }));
  const rows = Math.max(0, ...entries.map((e) => e.row));
  const cols = Math.max(0, ...entries.map((e) => e.col));
  const out: (FakeValue | undefined)[][] = Array.from({ length: rows }, () =>
    Array<FakeValue | undefined>(cols).fill(undefined),
  );
  for (const e of entries) out[e.row - 1]![e.col - 1] = e.v;
  return out;
}

const isFormula = (v: unknown): v is { f: string; v: number | string } =>
  typeof v === 'object' && v !== null && 'f' in v;
const isDate = (v: unknown): v is { date: number } =>
  typeof v === 'object' && v !== null && 'date' in v;

export class FakeApis {
  readonly spreadsheets = new Map<string, FakeSpreadsheet>();
  readonly workbooks = new Map<string, FakeWorkbook>();
  readonly linkedSheets = new Map<string, FakeLinkedSheet>();
  /** Par identifiant de déploiement (`…/macros/s/<id>/exec`). */
  readonly scripts = new Map<string, FakeScript>();
  /** Lectures de feuilles reçues (pour vérifier le cache). */
  sheetReads = 0;
  /** Téléchargements de Sheets publics reçus. */
  exports = 0;
  /** Le refresh token Microsoft est accepté ; `false` simule une connexion révoquée. */
  refreshValid = true;
  /** De même pour le refresh token Google. */
  googleRefreshValid = true;
  /** Identifiants `[client_id, client_secret]` reçus par le faux Google. */
  readonly googleClients: [string, string][] = [];
  private server?: Server;
  private refreshCount = 0;

  /** Port libre par défaut ; un port fixe pour les tests navigateur (e2e/). */
  async start(port = 0): Promise<string> {
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => {
        res.writeHead(500).end(String(error));
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(port, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => this.server?.close(resolve));
  }

  reset(): void {
    this.spreadsheets.clear();
    this.workbooks.clear();
    this.linkedSheets.clear();
    this.scripts.clear();
    this.sheetReads = 0;
    this.exports = 0;
    this.refreshValid = true;
    this.googleRefreshValid = true;
    this.googleClients.length = 0;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url!, 'http://fake');
    const path = decodeURIComponent(url.pathname);
    const body = await new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (c: Buffer) => (data += c.toString()));
      req.on('end', () => resolve(data));
    });
    const json = (status: number, payload?: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(payload === undefined ? '' : JSON.stringify(payload));
    };
    const auth = req.headers.authorization ?? '';

    // Google : page de connexion, qui accepte aussitôt et renvoie au site avec un code.
    if (path === '/google/authorize') {
      const back = new URL(url.searchParams.get('redirect_uri')!);
      back.searchParams.set('code', 'good-code');
      back.searchParams.set('state', url.searchParams.get('state') ?? '');
      res.writeHead(302, { Location: back.toString() }).end();
      return;
    }

    // Google : jetons OAuth. Comme le vrai, le rafraîchissement ne renvoie pas de refresh token.
    if (path === '/google/token' && req.method === 'POST') {
      const form = new URLSearchParams(body);
      this.googleClients.push([form.get('client_id') ?? '', form.get('client_secret') ?? '']);
      this.refreshCount += 1;
      // Durée courte : chaque appel repasse par le rafraîchissement.
      const access = { access_token: `google-access-${this.refreshCount}`, expires_in: 30 };
      if (form.get('grant_type') === 'authorization_code') {
        return form.get('code') === 'good-code'
          ? json(200, { ...access, refresh_token: 'google-refresh' })
          : json(400, { error: 'invalid_grant' });
      }
      return this.googleRefreshValid && form.get('refresh_token') === 'google-refresh'
        ? json(200, access)
        : json(400, { error: 'invalid_grant' });
    }

    if (path === '/google/userinfo') {
      return auth.startsWith('Bearer google-access-')
        ? json(200, { email: GOOGLE_ACCOUNT })
        : json(401, {});
    }

    // Google : téléchargement d'un Sheet par son lien. Non partagé : page de connexion.
    const exported = /^\/export\/spreadsheets\/d\/([^/]+)\/export$/.exec(path);
    if (exported) {
      const doc = this.linkedSheets.get(exported[1]!);
      if (!doc) return json(404, {});
      this.exports += 1;
      if (!doc.shared) {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>Connexion</html>');
        return;
      }
      res.writeHead(200, {
        'Content-Type': EXCEL_MIME,
        'Content-Disposition': `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(doc.title)}.xlsx`,
      });
      res.end(await buildXlsx(doc.sheets));
      return;
    }

    // Google : application web Apps Script. Déploiement retiré : page HTML, comme le vrai.
    const script = /^\/script\/macros\/s\/([^/]+)\/exec$/.exec(path);
    if (script && req.method === 'POST') {
      const doc = this.scripts.get(script[1]!);
      if (!doc) {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>Introuvable</html>');
        return;
      }
      const request = JSON.parse(body) as {
        secret: string;
        action: string;
        sheet: string;
        writes: { sheet: string; row: number; col: number; value: FakeValue }[];
      };
      const reply = (payload: object) => json(200, { ...payload, version: doc.version });
      if (request.secret !== doc.secret) return reply({ ok: false, error: 'forbidden' });
      if (request.action === 'meta') {
        return reply({ ok: true, name: doc.title, sheets: Object.keys(doc.sheets) });
      }
      if (request.action === 'read') {
        this.sheetReads += 1;
        const lines = grid(doc.sheets[request.sheet] ?? {});
        return reply({
          ok: true,
          values: lines.map((l) =>
            l.map((v) => {
              if (v === undefined) return '';
              if (isFormula(v)) return v.v;
              // Numéro de série → date en heure du classeur, comme `Utilities.formatDate`.
              return isDate(v)
                ? { d: new Date((v.date - 25_569) * 86_400_000).toISOString().slice(0, 19) }
                : v;
            }),
          ),
          formulas: lines.map((l) => l.map((v) => (isFormula(v) ? v.f : ''))),
        });
      }
      if (request.action === 'write') {
        for (const w of request.writes) {
          doc.sheets[w.sheet]![cellRef({ row: w.row, col: w.col })] = w.value;
        }
        return reply({ ok: true });
      }
      return reply({ ok: false, error: 'unknown action' });
    }

    // Google Sheets.
    const sheet = /^\/sheets\/spreadsheets\/([^/]+?)(\/values:batchUpdate)?$/.exec(path);
    if (sheet) {
      if (!auth.startsWith('Bearer google-access-')) return json(401, {});
      const doc = this.spreadsheets.get(sheet[1]!);
      if (!doc?.picked) return json(doc ? 403 : 404, { error: { status: 'PERMISSION_DENIED' } });
      if (sheet[2]) {
        const { data } = JSON.parse(body) as { data: { range: string; values: FakeValue[][] }[] };
        for (const d of data) {
          const m = /^'((?:[^']|'')+)'!([A-Z]+\d+)$/.exec(d.range)!;
          doc.sheets[m[1]!.replaceAll("''", "'")]![m[2]!] = d.values[0]![0]!;
        }
        return json(200, {});
      }
      const ranges = url.searchParams.get('ranges');
      if (!ranges) {
        return json(200, {
          properties: { title: doc.title },
          sheets: Object.keys(doc.sheets).map((title) => ({ properties: { title } })),
        });
      }
      this.sheetReads += 1;
      const name = /^'((?:[^']|'')+)'$/.exec(ranges)![1]!.replaceAll("''", "'");
      const rowData = grid(doc.sheets[name] ?? {}).map((line) => ({
        values: line.map((v) => {
          if (v === undefined || v === '') return {};
          if (isFormula(v)) {
            return {
              userEnteredValue: { formulaValue: v.f },
              effectiveValue: typeof v.v === 'number' ? { numberValue: v.v } : { stringValue: v.v },
            };
          }
          if (isDate(v)) {
            return {
              effectiveValue: { numberValue: v.date },
              effectiveFormat: { numberFormat: { type: 'DATE' } },
            };
          }
          if (typeof v === 'number') return { effectiveValue: { numberValue: v } };
          if (typeof v === 'boolean') return { effectiveValue: { boolValue: v } };
          return { effectiveValue: { stringValue: v } };
        }),
      }));
      return json(200, { sheets: [{ data: [{ startRow: 0, startColumn: 0, rowData }] }] });
    }

    // Microsoft : page de connexion, qui accepte aussitôt et renvoie au site avec un code.
    if (/^\/ms\/[^/]+\/oauth2\/v2\.0\/authorize$/.test(path)) {
      const back = new URL(url.searchParams.get('redirect_uri')!);
      back.searchParams.set('code', 'good-code');
      back.searchParams.set('state', url.searchParams.get('state') ?? '');
      res.writeHead(302, { Location: back.toString() }).end();
      return;
    }

    // Microsoft : jetons OAuth.
    if (/^\/ms\/[^/]+\/oauth2\/v2\.0\/token$/.test(path) && req.method === 'POST') {
      const form = new URLSearchParams(body);
      const tokens = () => {
        this.refreshCount += 1;
        // Durée courte : chaque appel repasse par le rafraîchissement.
        return {
          access_token: `ms-access-${this.refreshCount}`,
          refresh_token: `ms-refresh-${this.refreshCount}`,
          expires_in: 30,
        };
      };
      if (form.get('grant_type') === 'authorization_code') {
        return form.get('code') === 'good-code'
          ? json(200, tokens())
          : json(400, { error: 'invalid_grant' });
      }
      const refresh = form.get('refresh_token') ?? '';
      return this.refreshValid && refresh.startsWith('ms-refresh-')
        ? json(200, tokens())
        : json(400, { error: 'invalid_grant' });
    }

    // Microsoft Graph.
    if (path.startsWith('/graph/')) {
      if (!auth.startsWith('Bearer ms-access-')) return json(401, {});
      const graph = path.slice('/graph'.length);
      if (graph === '/me') return json(200, { userPrincipalName: 'marc@entreprise.fr' });
      if (graph === '/me/drive/root/children') {
        return json(200, {
          value: [
            ...[...this.workbooks].map(([id, w]) => ({ id, name: w.name, file: {} })),
            { id: 'folder1', name: 'Archives', folder: {} },
            { id: 'doc1', name: 'notes.docx', file: {} },
          ],
        });
      }
      const item = /^\/me\/drive\/items\/([^/]+)$/.exec(graph);
      if (item) {
        return this.workbooks.has(item[1]!)
          ? json(200, { id: item[1], parentReference: { driveId: 'drive1' } })
          : json(404, {});
      }
      const book = /^\/drives\/drive1\/items\/([^/]+)(\/workbook.*)?$/.exec(graph);
      const workbook = book ? this.workbooks.get(book[1]!) : undefined;
      if (!book || !workbook) return json(404, {});
      const rest = book[2] ?? '';
      if (!rest) return json(200, { name: workbook.name });
      if (rest === '/workbook/worksheets') {
        return json(200, { value: Object.keys(workbook.sheets).map((name) => ({ name })) });
      }
      const ws =
        /^\/workbook\/worksheets\('((?:[^']|'')+)'\)\/(usedRange|range\(address='([A-Z]+\d+)'\))$/.exec(
          rest,
        );
      const cells = ws ? workbook.sheets[ws[1]!.replaceAll("''", "'")] : undefined;
      if (!ws || !cells) return json(404, {});
      if (req.method === 'PATCH') {
        const { values } = JSON.parse(body) as { values: FakeValue[][] };
        cells[ws[3]!] = values[0]![0]!;
        return json(200, {});
      }
      this.sheetReads += 1;
      const lines = grid(cells);
      const value = (v: FakeValue | undefined) =>
        v === undefined ? '' : isFormula(v) ? v.v : isDate(v) ? v.date : v;
      const last = cellRef({
        row: Math.max(lines.length, 1),
        col: Math.max(lines[0]?.length ?? 1, 1),
      });
      return json(200, {
        address: `${ws[1]}!A1:${last}`,
        values: lines.map((l) => l.map(value)),
        valueTypes: lines.map((l) =>
          l.map((v) => {
            const x = value(v);
            if (x === '') return 'Empty';
            if (typeof x === 'number') return 'Double';
            return typeof x === 'boolean' ? 'Boolean' : 'String';
          }),
        ),
        formulas: lines.map((l) => l.map((v) => (isFormula(v) ? v.f : value(v)))),
        numberFormat: lines.map((l) => l.map((v) => (isDate(v) ? 'dd/mm/yyyy' : 'General'))),
      });
    }
    json(404, {});
  }
}
