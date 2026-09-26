import { Controller, Get, Query } from '@nestjs/common';
import type { AuditEntry, Paginated } from '@strategos/shared';
import { AuditQueryDto } from './audit.dto.js';
import { AuditService } from './audit.service.js';

/** Consultation du journal ; aucune route ne le modifie ni ne le supprime. */
@Controller('admin/audit')
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() query: AuditQueryDto): Promise<Paginated<AuditEntry>> {
    return this.audit.list(query);
  }
}
