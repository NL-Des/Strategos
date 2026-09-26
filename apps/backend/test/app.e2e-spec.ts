import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Public } from '../src/auth/decorators.js';
import { createTestApp } from './helpers.js';

/** Route présente seulement dans les tests : lève une erreur non gérée. */
@Controller('test-only')
class ThrowingController {
  @Public()
  @Get('crash')
  crash(): never {
    throw new Error('détail interne à ne pas divulguer');
  }
}

describe('Socle (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp([ThrowingController]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health → 200', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200, { status: 'ok' });
  });

  it('exception non gérée → 500 au format commun, sans la cause', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/test-only/crash').expect(500);
    expect(res.body).toEqual({ code: 'INTERNAL_ERROR', message: expect.any(String), details: {} });
    expect(JSON.stringify(res.body)).not.toContain('détail interne');
  });

  it('route inconnue → 404 NOT_FOUND au format commun', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
    expect(res.body).toEqual({ code: 'NOT_FOUND', message: expect.any(String), details: {} });
  });

  it('JSON mal formé → 400 VALIDATION_FAILED au format commun', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ pas du json')
      .expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', details: {} });
  });
});
