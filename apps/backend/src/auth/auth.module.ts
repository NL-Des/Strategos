import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from '../common/rate-limit.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import {
  AdminGuard,
  AuthGuard,
  CredentialsChangeGuard,
  CsrfGuard,
  SessionGuard,
} from './guards.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { SessionService } from './session.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    LoginThrottleService,
    // Guards globaux : l'ordre de déclaration est l'ordre d'exécution.
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CredentialsChangeGuard },
    { provide: APP_GUARD, useClass: AdminGuard },
  ],
  exports: [AuthService, SessionService, LoginThrottleService],
})
export class AuthModule {}
