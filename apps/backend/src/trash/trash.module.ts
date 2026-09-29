import { Module } from '@nestjs/common';
import { AdminTrashController } from './admin-trash.controller.js';
import { TrashService } from './trash.service.js';

/** Corbeille de l'admin : éléments supprimés en douceur et restauration tracée (04). */
@Module({
  controllers: [AdminTrashController],
  providers: [TrashService],
})
export class TrashModule {}
