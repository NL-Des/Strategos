import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import type { GroupDetail, GroupSummary } from '@strategos/shared';
import { Actor, type AuditActor } from '../audit/audit-actor.js';
import {
  CreateGroupDto,
  ReplaceMembersDto,
  ReplacePermissionsDto,
  UpdateGroupDto,
} from './groups.dto.js';
import { GroupsService } from './groups.service.js';
import { AdminOnly } from '../auth/decorators.js';

/** Groupes, côté admin (13 — Groupes et droits). Protégé globalement par `AdminGuard`. */
@AdminOnly()
@Controller('admin/groups')
export class AdminGroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  list(): Promise<GroupSummary[]> {
    return this.groups.list();
  }

  @Post()
  create(@Body() dto: CreateGroupDto, @Actor() actor: AuditActor): Promise<GroupDetail> {
    return this.groups.create(dto, actor);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<GroupDetail> {
    return this.groups.get(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupDto,
    @Actor() actor: AuditActor,
  ): Promise<GroupDetail> {
    return this.groups.update(id, dto, actor);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: AuditActor): Promise<void> {
    await this.groups.remove(id, actor);
  }

  @Put(':id/members')
  replaceMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceMembersDto,
    @Actor() actor: AuditActor,
  ): Promise<GroupDetail> {
    return this.groups.replaceMembers(id, dto.userIds, actor);
  }

  @Put(':id/permissions')
  replacePermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplacePermissionsDto,
    @Actor() actor: AuditActor,
  ): Promise<GroupDetail> {
    return this.groups.replacePermissions(id, dto.permissions, actor);
  }
}
