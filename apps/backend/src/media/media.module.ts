import { Module } from '@nestjs/common';
import { AdminMediaController } from './admin-media.controller.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';

/** Médiathèque (06) : fichiers sur le volume `uploads`, métadonnées en base. */
@Module({
  controllers: [AdminMediaController, MediaController],
  providers: [MediaService],
})
export class MediaModule {}
