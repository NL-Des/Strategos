import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, type ResourceType } from '@strategos/shared';
import type { Request } from 'express';
import { isUUID } from 'class-validator';
import { AppException } from '../common/app-exception.js';
import { RightsService } from '../groups/rights.service.js';

const REQUIRED_READ = 'permissions:read';

interface RequiredRead {
  type: ResourceType;
  /** Paramètre de route qui porte l'id de la ressource. */
  param: string;
}

/**
 * La route exige le droit de lecture sur une ressource (03 — Points techniques).
 * S'exécute après les guards globaux, donc derrière une session valide.
 */
export const RequireRead = (type: ResourceType, param = 'id') =>
  applyDecorators(
    SetMetadata(REQUIRED_READ, { type, param } satisfies RequiredRead),
    UseGuards(PermissionsGuard),
  );

/**
 * Vérifie les droits par ressource avec la fonction de résolution unique
 * (`RightsService`). L'admin a tous les droits. Une ressource illisible est
 * introuvable : `404`, jamais `403`, pour ne pas révéler son existence.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rights: RightsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<RequiredRead | undefined>(
      REQUIRED_READ,
      context.getHandler(),
    );
    if (!required) return true;
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.auth!.user;
    if (user.isAdmin) return true;
    const id = req.params[required.param];
    if (
      typeof id === 'string' &&
      isUUID(id) &&
      (await this.rights.canRead({ userId: user.id }, required.type, id))
    ) {
      return true;
    }
    throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}
