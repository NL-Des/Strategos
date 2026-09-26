import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  type AssembledLayout,
  type AssembledPage,
  type CatalogCard,
  type Paginated,
  ResourceType,
  type TableRow,
} from '@strategos/shared';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/request-context.js';
import { RequireRead } from '../permissions/permissions.guard.js';
import { DataBlocksService } from './data-blocks.service.js';
import { LayoutService } from './layout.service.js';
import { BlockRowsQueryDto } from './pages.dto.js';
import { PagesService } from './pages.service.js';

/** Pages vues par les utilisateurs (13 — Navigation et pages). */
@Controller()
export class PagesController {
  constructor(
    private readonly pages: PagesService,
    private readonly layout: LayoutService,
    private readonly dataBlocks: DataBlocksService,
  ) {}

  @Get('pages/:id')
  @RequireRead(ResourceType.page)
  read(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AssembledPage> {
    return this.pages.read(id, auth.user);
  }

  @Get('layout')
  readLayout(@CurrentAuth() auth: AuthContext): Promise<AssembledLayout> {
    return this.layout.read(auth.user);
  }

  /**
   * Lignes d'un Tableau ou d'un Catalogue publié : droit de lecture sur sa page
   * (vérifié par `PageAccessService`, même règle que `PermissionsGuard`).
   */
  @Get('blocks/:blockId/rows')
  rows(
    @Param('blockId', ParseUUIDPipe) blockId: string,
    @Query() query: BlockRowsQueryDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<Paginated<TableRow | CatalogCard>> {
    return this.dataBlocks.publishedRows(blockId, auth.user, query);
  }
}
