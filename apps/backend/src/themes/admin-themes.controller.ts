import { Controller, Get } from '@nestjs/common';
import type { Theme } from '@strategos/shared';
import { ThemesService } from './themes.service.js';

@Controller('admin/themes')
export class AdminThemesController {
  constructor(private readonly themes: ThemesService) {}

  @Get()
  list(): Promise<Theme[]> {
    return this.themes.list();
  }
}
