import { Injectable } from '@nestjs/common';
import { SourceStatus, SourceType } from '@strategos/shared';
import { config } from '../../config.js';
import type { Source } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SourceAuthExpiredError, SourceUnavailableError } from '../source-errors.js';
import type { RemoteSheet, SourceConnector } from './connector.js';
import { GsheetLinkConnector } from './gsheet-link.connector.js';
import { GsheetConnector } from './gsheet.connector.js';
import { OneDriveConnector } from './onedrive.connector.js';
import { SheetCache } from './sheet-cache.js';

/** Sources connectées : le document en ligne fait foi, lu à travers un cache mémoire court. */
export const isConnected = (source: Pick<Source, 'type'>) => source.type !== SourceType.upload;

/** Source où les validations peuvent écrire : toutes, sauf un Google Sheet par lien public. */
export const isWritable = (source: Pick<Source, 'type'>) => source.type !== SourceType.gsheet_link;

/**
 * Adaptateurs des sources connectées (Google Sheets, OneDrive) et leur cache
 * mémoire (08). Chaque lecture met à jour l'état de la source : `ok` et
 * `last_read_at`, ou `unavailable`.
 */
@Injectable()
export class SourceConnectors {
  private readonly cache = new SheetCache<RemoteSheet>(() => config.sourceCacheMs);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gsheet: GsheetConnector,
    private readonly onedrive: OneDriveConnector,
    private readonly gsheetLink: GsheetLinkConnector,
  ) {}

  for(type: Source['type']): SourceConnector {
    if (type === SourceType.gsheet) return this.gsheet;
    if (type === SourceType.onedrive) return this.onedrive;
    if (type === SourceType.gsheet_link) return this.gsheetLink;
    throw new Error(`Pas d'adaptateur pour une source ${type}`);
  }

  /** Feuille lue (copie du cache si elle est encore fraîche). */
  sheet(source: Source, sheet: string): Promise<RemoteSheet> {
    return this.cache.get(source.id, sheet, () =>
      this.track(source, () => this.for(source.type).fetchSheet(source, sheet)),
    );
  }

  /** Après une écriture, ou avant de lire la valeur de départ d'une validation. */
  invalidate(sourceId: string): void {
    this.cache.invalidate(sourceId);
    this.gsheetLink.invalidate(sourceId);
  }

  /** Appel à la source, avec mise à jour de son état. */
  async track<T>(source: Pick<Source, 'id'>, call: () => Promise<T>): Promise<T> {
    try {
      const result = await call();
      await this.prisma.source.updateMany({
        where: { id: source.id },
        data: { status: SourceStatus.ok, lastReadAt: new Date() },
      });
      return result;
    } catch (error) {
      if (error instanceof SourceUnavailableError && !(error instanceof SourceAuthExpiredError)) {
        await this.prisma.source.updateMany({
          where: { id: source.id },
          data: { status: SourceStatus.unavailable },
        });
      }
      throw error;
    }
  }
}
