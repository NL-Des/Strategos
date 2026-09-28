import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { PageAccessService } from './page-access.service.js';

/**
 * Lecture des pages (03) : isolée du page builder pour que les modules rattachés
 * aux pages (formulaires, discussions) l'utilisent sans dépendre de `PagesModule`.
 */
@Module({
  imports: [PermissionsModule],
  providers: [PageAccessService],
  exports: [PageAccessService],
})
export class PageAccessModule {}
