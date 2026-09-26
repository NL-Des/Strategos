import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import type { CatalogCard, Paginated, TableRow } from '@strategos/shared';
import { DataBlocksService } from './data-blocks.service.js';
import { BlockRowsQueryDto } from './pages.dto.js';

/** Lignes d'un module de brouillon, pour l'aperçu (13 — Page builder). */
@Controller('admin/blocks')
export class AdminBlocksController {
  constructor(private readonly dataBlocks: DataBlocksService) {}

  @Get(':blockId/rows')
  rows(
    @Param('blockId', ParseUUIDPipe) blockId: string,
    @Query() query: BlockRowsQueryDto,
  ): Promise<Paginated<TableRow | CatalogCard>> {
    return this.dataBlocks.previewRows(blockId, query);
  }
}
