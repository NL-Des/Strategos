import { NestFactory } from '@nestjs/core';
import { BackupService } from '../src/backups/backup.service.js';
import { CliModule } from '../src/cli/cli.module.js';
import { UsersService } from '../src/users/users.service.js';

describe('Commandes serveur (e2e)', () => {
  it('le contexte minimal des commandes résout leurs services', async () => {
    const app = await NestFactory.createApplicationContext(CliModule, { logger: false });
    try {
      expect(app.get(UsersService)).toBeInstanceOf(UsersService);
      expect(app.get(BackupService)).toBeInstanceOf(BackupService);
    } finally {
      await app.close();
    }
  });
});
