import { Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MediaService } from './media.service.js';

/** Images de la médiathèque : lisibles par tout utilisateur connecté (06 — Médiathèque). */
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const { path, mime } = await this.media.file(id);
    res.sendFile(path, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      },
    });
  }
}
