import ExcelJS from 'exceljs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

type CellValue = ExcelJS.CellValue;

/** Classeur de test : `{ Feuille: { A1: valeur, … } }`. */
export async function buildXlsx(
  sheets: Record<string, Record<string, CellValue>>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const [name, cells] of Object.entries(sheets)) {
    const sheet = workbook.addWorksheet(name);
    for (const [ref, value] of Object.entries(cells)) sheet.getCell(ref).value = value;
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Ajoute au paquet les parties d'une liaison vers un autre classeur, comme le
 * fait Excel : `[1]` dans les formules désigne alors `target`.
 */
export function withExternalLink(xlsx: Buffer, target: string): Buffer {
  const files = unzipSync(new Uint8Array(xlsx));
  const edit = (name: string, change: (xml: string) => string) => {
    files[name] = strToU8(change(strFromU8(files[name]!)));
  };
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  edit('xl/workbook.xml', (xml) =>
    xml.replace(
      '</sheets>',
      `</sheets><externalReferences><externalReference xmlns:r="${rel}" r:id="rIdExt1"/></externalReferences>`,
    ),
  );
  edit('xl/_rels/workbook.xml.rels', (xml) =>
    xml.replace(
      '</Relationships>',
      `<Relationship Id="rIdExt1" Type="${rel}/externalLink" Target="externalLinks/externalLink1.xml"/></Relationships>`,
    ),
  );
  edit('[Content_Types].xml', (xml) =>
    xml.replace(
      '</Types>',
      '<Override PartName="/xl/externalLinks/externalLink1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml"/></Types>',
    ),
  );
  files['xl/externalLinks/externalLink1.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><externalLink xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><externalBook xmlns:r="${rel}" r:id="rId1"/></externalLink>`,
  );
  files['xl/externalLinks/_rels/externalLink1.xml.rels'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/externalLinkPath" Target="${target}" TargetMode="External"/></Relationships>`,
  );
  return Buffer.from(zipSync(files));
}
