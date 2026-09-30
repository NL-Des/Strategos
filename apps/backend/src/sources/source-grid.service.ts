import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type SourceGrid, SourceType } from '@strategos/shared';
import { AppException } from '../common/app-exception.js';
import { formatText } from './cell-format.js';
import { SourceDataService } from './source-data.service.js';
import { SourcesService, sheetsOf } from './sources.service.js';

export interface GridWindow {
  sheet?: string;
  top: number;
  left: number;
  rows: number;
  cols: number;
}

/**
 * Grille d'un Excel uploadé, réservée à l'admin (04 — Sources) : la copie de
 * référence (staging) vue comme un tableur. Les sources connectées se
 * consultent dans leur outil natif.
 */
@Injectable()
export class SourceGridService {
  constructor(
    private readonly sources: SourcesService,
    private readonly data: SourceDataService,
  ) {}

  async window(sourceId: string, w: GridWindow): Promise<SourceGrid> {
    const source = await this.sources.get(sourceId);
    if (source.type !== SourceType.upload) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
    }
    const sheets = sheetsOf(source);
    const sheet = w.sheet ?? sheets[0];
    if (sheet === undefined || !sheets.includes(sheet)) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
    }
    const { cells, maxRow, maxCol } = await this.data.stagingWindow(sourceId, sheet, {
      top: w.top,
      left: w.left,
      bottom: w.top + w.rows - 1,
      right: w.left + w.cols - 1,
    });
    return {
      sheets,
      sheet,
      maxRow,
      maxCol,
      top: w.top,
      left: w.left,
      rows: w.rows,
      cols: w.cols,
      cells: cells.map((c) => ({
        row: c.row,
        col: c.col,
        type: c.stored.type,
        display: formatText(c.stored, 'text'),
        formula: c.formula,
        needsRecalc: c.stored.needsRecalc,
      })),
    };
  }
}
