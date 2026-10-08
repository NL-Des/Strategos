import { Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  type ResourceRights,
  ResourceType,
  type RightsMatrix,
  type UserRights,
} from '@strategos/shared';
import { RightsMatrixQueryDto } from './groups.dto.js';
import { RightsService } from './rights.service.js';
import { AdminOnly } from '../auth/decorators.js';

/** Visualisation des droits (04), en lecture seule, calculée par `RightsService`. */
@AdminOnly()
@Controller('admin/rights')
export class AdminRightsController {
  constructor(private readonly rights: RightsService) {}

  @Get('users/:id')
  user(@Param('id', ParseUUIDPipe) id: string): Promise<UserRights> {
    return this.rights.userRights(id);
  }

  @Get('resources/:type/:id')
  resource(
    @Param('type', new ParseEnumPipe(ResourceType)) type: ResourceType,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ResourceRights> {
    return this.rights.resourceRights(type, id);
  }

  @Get('matrix')
  matrix(@Query() query: RightsMatrixQueryDto): Promise<RightsMatrix> {
    return this.rights.matrix(query);
  }
}
