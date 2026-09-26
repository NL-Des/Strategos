import { Global, Module } from '@nestjs/common';
import { AdminAuditController } from './admin-audit.controller.js';
import { AuditService } from './audit.service.js';

/** Global : tout module qui modifie des données tracées écrit au journal. */
@Global()
@Module({
  controllers: [AdminAuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
