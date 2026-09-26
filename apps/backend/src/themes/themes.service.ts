import { Injectable } from '@nestjs/common';
import type { Theme, ThemeConfig } from '@strategos/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/** Lecture des thèmes ; l'éditeur arrive à l'étape 11. */
@Injectable()
export class ThemesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<Theme[]> {
    const themes = await this.prisma.theme.findMany({ orderBy: { name: 'asc' } });
    return themes.map((t) => ({
      id: t.id,
      name: t.name,
      config: t.config as unknown as ThemeConfig,
      version: t.version,
    }));
  }

  async exists(id: string): Promise<boolean> {
    return (await this.prisma.theme.count({ where: { id } })) > 0;
  }

  /** Thème de la page s'il existe encore, sinon le thème par défaut. */
  async resolve(themeId: string | null): Promise<{ id: string; config: ThemeConfig }> {
    const theme =
      (themeId ? await this.prisma.theme.findUnique({ where: { id: themeId } }) : null) ??
      (
        await this.prisma.setting.findUniqueOrThrow({
          where: { id: 1 },
          include: { defaultTheme: true },
        })
      ).defaultTheme;
    if (!theme) throw new Error('Aucun thème par défaut : données initiales absentes.');
    return { id: theme.id, config: theme.config as unknown as ThemeConfig };
  }
}
