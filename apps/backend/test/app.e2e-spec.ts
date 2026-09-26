import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/setup.js';

/** Route présente seulement dans les tests : lève une erreur non gérée. */
@Controller('test-only')
class ThrowingController {
  @Get('crash')
  crash(): never {
    throw new Error('détail interne à ne pas divulguer');
  }
}

describe('Socle (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ThrowingController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
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
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{ pas du json')
      .expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', details: {} });
  });
});
