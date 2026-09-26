import { IsBoolean, IsIn, IsUUID } from 'class-validator';
import { RESOURCE_TYPES, type GroupPermissionInput, type ResourceType } from '../rights.js';

/**
 * Permission d'un groupe. Les règles croisées (une page n'accorde que la lecture,
 * pas de création sans lecture) sont vérifiées par le service, et en base par
 * des contraintes `CHECK`.
 */
export class GroupPermissionInputSchema implements GroupPermissionInput {
  @IsIn(RESOURCE_TYPES)
  resourceType: ResourceType;

  @IsUUID()
  resourceId: string;

  @IsBoolean()
  canRead: boolean;

  @IsBoolean()
  canCreateTopic: boolean;

  @IsBoolean()
  canPost: boolean;
}
