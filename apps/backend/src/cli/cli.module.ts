import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { LoginThrottleService } from '../auth/login-throttle.service.js';
import { SessionService } from '../auth/session.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersService } from '../users/users.service.js';

/** Contexte minimal des commandes serveur : pas de contrôleurs, pas de guards. */
@Module({
  imports: [PrismaModule, AuditModule],
  providers: [UsersService, SessionService, LoginThrottleService],
})
export class CliModule {}
