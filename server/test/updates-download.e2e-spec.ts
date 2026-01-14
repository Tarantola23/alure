import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('Updates download token flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let storageDir: string;

  beforeAll(async () => {
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'alure-e2e-'));
    process.env.ASSET_STORAGE_DIR = storageDir;
    process.env.DOWNLOAD_TOKEN_SECRET = 'test-download-secret';
    process.env.DOWNLOAD_TOKEN_TTL_MINUTES = '10';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(storageDir, { recursive: true, force: true });
    delete process.env.ASSET_STORAGE_DIR;
    delete process.env.DOWNLOAD_TOKEN_SECRET;
    delete process.env.DOWNLOAD_TOKEN_TTL_MINUTES;
  });

  it('creates license, activates, verifies, and downloads via token', async () => {
    const projectName = `E2E Project ${Date.now()}`;
    const projectRes = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .send({ name: projectName })
      .expect(201);
    const projectId = projectRes.body.id as string;

    const licenseRes = await request(app.getHttpServer())
      .post('/api/v1/licenses')
      .send({ project_id: projectId, plan: 'basic', max_activations: 1 })
      .expect(201);
    const licenseKey = licenseRes.body.license_key as string;

    const deviceId = 'device-e2e-1';
    const activateRes = await request(app.getHttpServer())
      .post('/api/v1/licenses/activate')
      .send({ license_key: licenseKey, device_id: deviceId })
      .expect(201);
    const receipt = activateRes.body.receipt as string;

    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/licenses/verify')
      .send({ receipt, device_id: deviceId })
      .expect(201);
    expect(verifyRes.body.valid).toBe(true);

    const filePath = path.join(storageDir, 'build.txt');
    const fileContent = 'build-content';
    await fs.writeFile(filePath, fileContent);

    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/releases/upload`)
      .field('version', '1.0.0')
      .field('channel', 'stable')
      .attach('file', filePath)
      .expect(201);

    const latestRes = await request(app.getHttpServer())
      .get(`/api/v1/updates/latest?project_id=${projectId}&channel=stable`)
      .expect(200);
    const assetId = latestRes.body.asset?.asset_id as string;
    expect(assetId).toBeTruthy();

    const tokenRes = await request(app.getHttpServer())
      .post('/api/v1/updates/download-token')
      .send({ receipt, device_id: deviceId, asset_id: assetId })
      .expect(201);
    const token = tokenRes.body.token as string;
    expect(token).toBeTruthy();

    const downloadRes = await request(app.getHttpServer())
      .get(`/api/v1/updates/download/${assetId}?token=${token}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(downloadRes.headers['content-disposition']).toContain('attachment');
    expect(downloadRes.body.toString('utf-8')).toBe(fileContent);

    await prisma.project.delete({ where: { id: projectId } });
  });
});
