import { Module } from '@nestjs/common';
import { LoginThrottleService } from '../auth/login-throttle.service.js';
import { SessionService } from '../auth/session.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersService } from '../users/users.service.js';

/** Contexte minimal des commandes serveur : pas de contrôleurs, pas de guards. */
@Module({
  imports: [PrismaModule],
  providers: [UsersService, SessionService, LoginThrottleService],
})
export class CliModule {}
