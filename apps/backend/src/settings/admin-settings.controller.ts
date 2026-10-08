import { Body, Controller, Get, Put } from '@nestjs/common';
import type { InstanceSettings } from '@strategos/shared';
import { Actor, type AuditActor } from '../audit/audit-actor.js';
import { UpdateSettingsDto } from './settings.dto.js';
import { SettingsService } from './settings.service.js';
import { AdminOnly } from '../auth/decorators.js';

/** Réglages de l'instance : page d'arrivée, thème par défaut, conservation des sauvegardes. */
@AdminOnly()
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(): Promise<InstanceSettings> {
    return this.settings.get();
  }

  @Put()
  update(@Body() dto: UpdateSettingsDto, @Actor() actor: AuditActor): Promise<InstanceSettings> {
    return this.settings.update(dto, actor);
  }
}
