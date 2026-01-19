import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import jwt from 'jsonwebtoken';
import {
  AssetDto,
  LatestUpdateQueryDto,
  LatestUpdateResponseDto,
  ReleaseDto,
} from '../licensing/licensing.types';
import { PrismaService } from '../prisma/prisma.service';
import { LicensingService } from '../licensing/licensing.service';
import { DownloadTokenResponseDto } from './updates.types';
import { downloadFromGcs, isGcsPath } from '../storage/storage';

@Injectable()
export class UpdatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly licensingService: LicensingService,
  ) {}

  async latest(query: LatestUpdateQueryDto): Promise<LatestUpdateResponseDto> {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const releaseRow = await tx.release.findFirst({
        where: { projectId: query.project_id, channel: query.channel },
        orderBy: { publishedAt: 'desc' },
        include: { asset: true },
      });

      if (!releaseRow) {
        return {
          update_available: false,
          server_time: now.toISOString(),
        };
      }

      const release: ReleaseDto = {
        release_id: releaseRow.id,
        version: releaseRow.version,
        channel: releaseRow.channel,
        published_at: releaseRow.publishedAt.toISOString(),
      };

      const asset: AssetDto | undefined = releaseRow.asset
        ? {
            asset_id: releaseRow.asset.id,
            filename: releaseRow.asset.filename,
            size_bytes: releaseRow.asset.sizeBytes,
            sha256: releaseRow.asset.sha256,
            download_url: releaseRow.asset.downloadUrl,
          }
        : undefined;

      return {
        update_available: true,
        latest_version: release.version,
        release_notes: releaseRow.notes ?? undefined,
        release,
        asset,
        server_time: now.toISOString(),
      };
    });
  }

  async download(assetId: string): Promise<{ filename: string; buffer: Buffer; contentType: string }> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || !asset.storagePath) {
      throw new HttpException('asset_not_found', HttpStatus.NOT_FOUND);
    }
    let buffer: Buffer;
    try {
      buffer = isGcsPath(asset.storagePath)
        ? await downloadFromGcs(asset.storagePath)
        : await readFile(asset.storagePath);
    } catch (error: any) {
      if (error?.code === 404 || error?.code === 'ENOENT') {
        throw new HttpException('asset_not_found', HttpStatus.NOT_FOUND);
      }
      throw error;
    }
    return {
      filename: asset.filename,
      buffer,
      contentType: asset.contentType || 'application/octet-stream',
    };
  }

  async createDownloadToken(
    assetId: string,
    receipt: string,
    deviceId: string,
  ): Promise<DownloadTokenResponseDto> {
    const validation = await this.licensingService.verify({ receipt, device_id: deviceId });
    if (!validation.valid) {
      throw new HttpException('license_invalid', HttpStatus.FORBIDDEN);
    }
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { release: true },
    });
    if (!asset || !asset.release) {
      throw new HttpException('asset_not_found', HttpStatus.NOT_FOUND);
    }
    const receiptProjectId = this.extractProjectId(receipt);
    if (receiptProjectId && asset.release.projectId !== receiptProjectId) {
      throw new HttpException('asset_project_mismatch', HttpStatus.FORBIDDEN);
    }
    const secret = process.env.DOWNLOAD_TOKEN_SECRET || process.env.JWT_SECRET || 'dev-secret';
    const ttlMinutes = Number(process.env.DOWNLOAD_TOKEN_TTL_MINUTES || '10');
    const token = jwt.sign({ type: 'download', asset_id: assetId }, secret, {
      expiresIn: `${ttlMinutes}m`,
    });
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
    return { token, expires_at: expiresAt };
  }

  private extractProjectId(receipt: string): string | null {
    const parts = receipt.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') {
      return null;
    }
    try {
      const payloadJson = Buffer.from(this.fromBase64Url(parts[1])).toString('utf-8');
      const payload = JSON.parse(payloadJson) as { project_id?: string };
      return payload.project_id ?? null;
    } catch {
      return null;
    }
  }

  private fromBase64Url(value: string): Buffer {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(
      value.length + (4 - (value.length % 4 || 4)) % 4,
      '=',
    );
    return Buffer.from(padded, 'base64');
  }

  authorizeDownload(assetId: string, authHeader?: string, token?: string): void {
    const secret = process.env.DOWNLOAD_TOKEN_SECRET || process.env.JWT_SECRET || 'dev-secret';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const jwtToken = authHeader.slice('Bearer '.length);
      try {
        jwt.verify(jwtToken, process.env.JWT_SECRET || 'dev-secret');
        return;
      } catch {
        throw new HttpException('invalid_token', HttpStatus.UNAUTHORIZED);
      }
    }
    if (token) {
      try {
        const payload = jwt.verify(token, secret) as { type?: string; asset_id?: string };
        if (payload.type !== 'download' || payload.asset_id !== assetId) {
          throw new HttpException('invalid_token', HttpStatus.UNAUTHORIZED);
        }
        return;
      } catch {
        throw new HttpException('invalid_token', HttpStatus.UNAUTHORIZED);
      }
    }
    throw new HttpException('missing_token', HttpStatus.UNAUTHORIZED);
  }
}
