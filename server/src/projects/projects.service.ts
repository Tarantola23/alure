import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { unlink } from 'fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProjectRequestDto,
  CreateReleaseRequestDto,
  ProjectDto,
  PromoteReleaseRequestDto,
  ReleaseListItemDto,
} from './projects.types';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import type { $Enums } from '@prisma/client';
import { uploadToGcs } from '../storage/storage';
type UploadedReleaseFile = {
  path: string;
  originalname: string;
  mimetype: string;
};

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private mapRelease(release: {
    id: string;
    version: string;
    channel: string;
    notes: string | null;
    publishedAt: Date;
    asset: null | {
      id: string;
      filename: string;
      sizeBytes: number;
      sha256: string;
      downloadUrl: string;
    };
  }): ReleaseListItemDto {
    return {
      id: release.id,
      version: release.version,
      channel: release.channel,
      notes: release.notes ?? undefined,
      published_at: release.publishedAt.toISOString(),
      asset: release.asset
        ? {
            id: release.asset.id,
            filename: release.asset.filename,
            size_bytes: release.asset.sizeBytes,
            sha256: release.asset.sha256,
            download_url: release.asset.downloadUrl,
          }
        : undefined,
    };
  }

  private async hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);
      stream.on('error', reject);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  async listProjects(): Promise<ProjectDto[]> {
    const projects = await this.prisma.project.findMany({ orderBy: { createdAt: 'desc' } });
    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      created_at: project.createdAt.toISOString(),
      updated_at: project.updatedAt.toISOString(),
    }));
  }

  async createProject(body: CreateProjectRequestDto): Promise<ProjectDto> {
    try {
      const project = await this.prisma.project.create({
        data: { name: body.name },
      });

      return {
        id: project.id,
        name: project.name,
        created_at: project.createdAt.toISOString(),
        updated_at: project.updatedAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new HttpException('project_name_already_exists', HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async listReleases(projectId: string): Promise<ReleaseListItemDto[]> {
    const releases = await this.prisma.release.findMany({
      where: { projectId },
      include: { asset: true },
      orderBy: { publishedAt: 'desc' },
    });

    return releases.map((release) => this.mapRelease(release));
  }

  async createRelease(projectId: string, body: CreateReleaseRequestDto): Promise<ReleaseListItemDto> {
    const release = await this.prisma.release.create({
      data: {
        projectId,
        version: body.version,
        channel: body.channel as $Enums.Channel,
        notes: body.notes ?? null,
        asset: body.asset
          ? {
              create: {
                filename: body.asset.filename,
                sizeBytes: body.asset.size_bytes,
                sha256: body.asset.sha256,
                downloadUrl: '',
                storagePath: null,
                contentType: null,
              },
            }
          : undefined,
      },
      include: { asset: true },
    });

    if (release.asset) {
      await this.prisma.asset.update({
        where: { id: release.asset.id },
        data: { downloadUrl: `/api/v1/updates/download/${release.asset.id}` },
      });
    }

    const refreshed = await this.prisma.release.findUnique({
      where: { id: release.id },
      include: { asset: true },
    });

    if (!refreshed) {
      throw new Error('release_not_found');
    }

    return this.mapRelease(refreshed);
  }

  async getRelease(projectId: string, releaseId: string): Promise<ReleaseListItemDto> {
    const release = await this.prisma.release.findFirst({
      where: { id: releaseId, projectId },
      include: { asset: true },
    });
    if (!release) {
      throw new HttpException('release_not_found', HttpStatus.NOT_FOUND);
    }
    return this.mapRelease(release);
  }

  async createReleaseWithUpload(
    projectId: string,
    body: { version: string; channel: string; notes?: string },
    file: UploadedReleaseFile,
  ): Promise<ReleaseListItemDto> {
    if (!file) {
      throw new HttpException('file_required', HttpStatus.BAD_REQUEST);
    }
    if (!body.version || !body.channel) {
      throw new HttpException('invalid_release', HttpStatus.BAD_REQUEST);
    }
    if (!['stable', 'beta', 'hotfix'].includes(body.channel)) {
      throw new HttpException('invalid_channel', HttpStatus.BAD_REQUEST);
    }
    const fileStats = await stat(file.path);
    const sha256 = await this.hashFile(file.path);
    const filename = file.path.split(/[\\/]/).pop() || file.originalname;
    const storagePath = process.env.GCS_BUCKET
      ? await uploadToGcs(file.path, filename, file.mimetype)
      : file.path;
    if (process.env.GCS_BUCKET) {
      await unlink(file.path);
    }
    const release = await this.prisma.release.create({
      data: {
        projectId,
        version: body.version,
        channel: body.channel as $Enums.Channel,
        notes: body.notes ?? null,
        asset: {
          create: {
            filename: file.originalname,
            sizeBytes: fileStats.size,
            sha256,
            downloadUrl: '',
            storagePath,
            contentType: file.mimetype,
          },
        },
      },
      include: { asset: true },
    });
    if (release.asset) {
      await this.prisma.asset.update({
        where: { id: release.asset.id },
        data: { downloadUrl: `/api/v1/updates/download/${release.asset.id}` },
      });
    }
    const refreshed = await this.prisma.release.findUnique({
      where: { id: release.id },
      include: { asset: true },
    });
    if (!refreshed) {
      throw new Error('release_not_found');
    }
    return this.mapRelease(refreshed);
  }

  async promoteRelease(
    projectId: string,
    releaseId: string,
    body: PromoteReleaseRequestDto,
  ): Promise<ReleaseListItemDto> {
    const source = await this.prisma.release.findFirst({
      where: { id: releaseId, projectId },
      include: { asset: true },
    });
    if (!source) {
      throw new HttpException('release_not_found', HttpStatus.NOT_FOUND);
    }
    const cloned = await this.prisma.release.create({
      data: {
        projectId,
        version: source.version,
        channel: body.channel as $Enums.Channel,
        notes: source.notes,
        asset: source.asset
          ? {
              create: {
                filename: source.asset.filename,
                sizeBytes: source.asset.sizeBytes,
                sha256: source.asset.sha256,
                downloadUrl: '',
                storagePath: source.asset.storagePath,
                contentType: source.asset.contentType,
              },
            }
          : undefined,
      },
      include: { asset: true },
    });
    if (cloned.asset) {
      await this.prisma.asset.update({
        where: { id: cloned.asset.id },
        data: { downloadUrl: `/api/v1/updates/download/${cloned.asset.id}` },
      });
    }
    const refreshed = await this.prisma.release.findUnique({
      where: { id: cloned.id },
      include: { asset: true },
    });
    if (!refreshed) {
      throw new Error('release_not_found');
    }
    return this.mapRelease(refreshed);
  }

  async deleteProject(projectId: string): Promise<{ deleted: boolean }> {
    try {
      await this.prisma.project.delete({ where: { id: projectId } });
      return { deleted: true };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new HttpException('project_not_found', HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }
}
