import jwt from 'jsonwebtoken';
import { HttpException } from '@nestjs/common';
import { UpdatesService } from './updates.service';

type PrismaMock = {
  asset: {
    findUnique: jest.Mock;
  };
};

type LicensingMock = {
  verify: jest.Mock;
};

const base64Url = (value: string): string =>
  Buffer.from(value, 'utf-8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const buildReceipt = (payload: Record<string, unknown>): string => {
  const payloadB64 = base64Url(JSON.stringify(payload));
  return `v1.${payloadB64}.sig`;
};

describe('UpdatesService download tokens', () => {
  let prisma: PrismaMock;
  let licensing: LicensingMock;
  let service: UpdatesService;

  beforeEach(() => {
    prisma = {
      asset: {
        findUnique: jest.fn(),
      },
    };
    licensing = {
      verify: jest.fn(),
    };
    service = new UpdatesService(prisma as any, licensing as any);
    process.env.DOWNLOAD_TOKEN_SECRET = 'test-download-secret';
    process.env.DOWNLOAD_TOKEN_TTL_MINUTES = '10';
  });

  afterEach(() => {
    delete process.env.DOWNLOAD_TOKEN_SECRET;
    delete process.env.DOWNLOAD_TOKEN_TTL_MINUTES;
  });

  it('issues a token when receipt project matches asset project', async () => {
    licensing.verify.mockResolvedValue({ valid: true });
    prisma.asset.findUnique.mockResolvedValue({
      id: 'asset-1',
      release: { projectId: 'proj-1' },
    });

    const receipt = buildReceipt({ project_id: 'proj-1' });
    const result = await service.createDownloadToken('asset-1', receipt, 'device-1');

    expect(result.token).toBeTruthy();
    const payload = jwt.verify(result.token, 'test-download-secret') as { asset_id: string; type: string };
    expect(payload.type).toBe('download');
    expect(payload.asset_id).toBe('asset-1');
  });

  it('rejects token when receipt project mismatches asset project', async () => {
    licensing.verify.mockResolvedValue({ valid: true });
    prisma.asset.findUnique.mockResolvedValue({
      id: 'asset-1',
      release: { projectId: 'proj-2' },
    });

    const receipt = buildReceipt({ project_id: 'proj-1' });

    await expect(
      service.createDownloadToken('asset-1', receipt, 'device-1'),
    ).rejects.toMatchObject({
      message: 'asset_project_mismatch',
    } as HttpException);
  });
});
