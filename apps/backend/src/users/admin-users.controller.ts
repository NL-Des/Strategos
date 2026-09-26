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
  Query,
} from '@nestjs/common';
import type { Paginated, UserDetail, UserSummary } from '@strategos/shared';
import { Actor, type AuditActor } from '../audit/audit-actor.js';
import { toUserDetail } from './user.mapper.js';
import { CreateUserDto, ListUsersQueryDto, ResetPasswordDto, UpdateUserDto } from './users.dto.js';
import { UsersService } from './users.service.js';

/** Comptes, côté admin (13 — routes Comptes). Protégé globalement par `AdminGuard`. */
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() query: ListUsersQueryDto): Promise<Paginated<UserSummary>> {
    return this.users.list(query);
  }

  @Post()
  async create(@Body() dto: CreateUserDto, @Actor() actor: AuditActor): Promise<UserDetail> {
    return toUserDetail(await this.users.create(dto, actor));
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<UserDetail> {
    return toUserDetail(await this.users.get(id));
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Actor() actor: AuditActor,
  ): Promise<UserDetail> {
    return toUserDetail(await this.users.update(id, dto, actor));
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/reset-password')
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @Actor() actor: AuditActor,
  ): Promise<UserDetail> {
    return toUserDetail(await this.users.resetPassword(id, dto.temporaryPassword, actor));
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/disable')
  async disable(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: AuditActor,
  ): Promise<UserDetail> {
    return toUserDetail(await this.users.disable(id, actor));
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/enable')
  async enable(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: AuditActor,
  ): Promise<UserDetail> {
    return toUserDetail(await this.users.enable(id, actor));
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: AuditActor): Promise<void> {
    await this.users.remove(id, actor);
  }
}
