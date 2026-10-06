/**
 * Script Apps Script que l'admin colle dans son Google Sheet et déploie en
 * application web (08). Il agit sur le Sheet au nom de son propriétaire, pour
 * qui présente le secret. Changer le protocole demande d'augmenter
 * `SCRIPT_VERSION` : les sources déjà reliées sont alors signalées « script à
 * mettre à jour ».
 */
export const SCRIPT_VERSION = 1;

/** Le secret est en base64url : il s'insère tel quel entre apostrophes. */
export function scriptSource(secret: string): string {
  return `// Strategos : script de liaison (version ${SCRIPT_VERSION}).
// Ne partagez ni ce script ni l'adresse de son déploiement : ils donnent accès à ce Sheet.
var SECRET = '${secret}';
var VERSION = ${SCRIPT_VERSION};

function doPost(e) {
  var out;
  try {
    var request = JSON.parse(e.postData.contents);
    out = request.secret === SECRET ? handle(request) : { ok: false, error: 'forbidden' };
  } catch (error) {
    out = { ok: false, error: String(error) };
  }
  out.version = VERSION;
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function handle(request) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  if (request.action === 'meta') {
    return {
      ok: true,
      name: book.getName(),
      sheets: book.getSheets().map(function (sheet) {
        return sheet.getName();
      })
    };
  }
  if (request.action === 'read') {
    var sheet = book.getSheetByName(request.sheet);
    if (!sheet) return { ok: true, values: [], formulas: [] };
    var range = sheet.getDataRange();
    var zone = book.getSpreadsheetTimeZone();
    return {
      ok: true,
      values: range.getValues().map(function (row) {
        return row.map(function (value) {
          return value instanceof Date
            ? { d: Utilities.formatDate(value, zone, "yyyy-MM-dd'T'HH:mm:ss") }
            : value;
        });
      }),
      formulas: range.getFormulas()
    };
  }
  if (request.action === 'write') {
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      request.writes.forEach(function (write) {
        var target = book.getSheetByName(write.sheet);
        if (!target) throw new Error('sheet not found');
        var value = write.value;
        // Une apostrophe en tête garde un texte tel quel : ni formule, ni date, ni nombre.
        if (typeof value === 'string' && value !== '') value = "'" + value;
        target.getRange(write.row, write.col).setValue(value);
      });
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
    return { ok: true };
  }
  return { ok: false, error: 'unknown action' };
}
`;
}
