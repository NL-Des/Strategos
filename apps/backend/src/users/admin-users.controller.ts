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
  Query,
} from '@nestjs/common';
import type { Paginated, UserDetail, UserSummary } from '@strategos/shared';
import { Actor, type AuditActor } from '../audit/audit-actor.js';
import { ReplaceUserGroupsDto } from '../groups/groups.dto.js';
import { GroupsService } from '../groups/groups.service.js';
import { CreateUserDto, ListUsersQueryDto, ResetPasswordDto, UpdateUserDto } from './users.dto.js';
import { UsersService } from './users.service.js';

/** Comptes, côté admin (13 — routes Comptes). Protégé globalement par `AdminGuard`. */
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly users: UsersService,
    private readonly groups: GroupsService,
  ) {}

  @Get()
  list(@Query() query: ListUsersQueryDto): Promise<Paginated<UserSummary>> {
    return this.users.list(query);
  }

  @Post()
  async create(@Body() dto: CreateUserDto, @Actor() actor: AuditActor): Promise<UserDetail> {
    return this.users.detail((await this.users.create(dto, actor)).id);
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<UserDetail> {
    return this.users.detail(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Actor() actor: AuditActor,
  ): Promise<UserDetail> {
    await this.users.update(id, dto, actor);
    return this.users.detail(id);
  }

  /** Groupes du compte, depuis sa fiche (03 — Gestion des groupes). */
  @Put(':id/groups')
  async replaceGroups(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceUserGroupsDto,
    @Actor() actor: AuditActor,
  ): Promise<UserDetail> {
    await this.groups.replaceUserGroups(id, dto.groupIds, actor);
    return this.users.detail(id);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/reset-password')
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @Actor() actor: AuditActor,
  ): Promise<UserDetail> {
    await this.users.resetPassword(id, dto.temporaryPassword, actor);
    return this.users.detail(id);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/disable')
  async disable(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: AuditActor,
  ): Promise<UserDetail> {
    await this.users.disable(id, actor);
    return this.users.detail(id);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/enable')
  async enable(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: AuditActor,
  ): Promise<UserDetail> {
    await this.users.enable(id, actor);
    return this.users.detail(id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: AuditActor): Promise<void> {
    await this.users.remove(id, actor);
  }
}
