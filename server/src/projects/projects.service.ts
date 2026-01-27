import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { unlink } from 'fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProjectRequestDto,
  CreateProjectModuleRequestDto,
  CreateReleaseRequestDto,
  ProjectDto,
  ProjectModuleDto,
  ProjectOverviewDto,
  PromoteReleaseRequestDto,
  ReleaseListItemDto,
  UpdateProjectModuleRequestDto,
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

  private normalizeParams(params?: Record<string, string> | null): Record<string, string> | undefined {
    if (!params) return undefined;
    const entries = Object.entries(params).filter(([, value]) => typeof value === 'string');
    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  private mapModule(module: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    params: unknown;
    createdAt: Date;
  }): ProjectModuleDto {
    return {
      id: module.id,
      key: module.key,
      name: module.name,
      description: module.description ?? undefined,
      params: this.normalizeParams(module.params as Record<string, string> | null),
      created_at: module.createdAt.toISOString(),
    };
  }

  private mapRelease(release: {
    id: string;
    version: string;
    channel: string | null;
    status: string;
    notes: string | null;
    publishedAt: Date | null;
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
      channel: release.channel ?? undefined,
      status: release.status,
      notes: release.notes ?? undefined,
      published_at: release.publishedAt ? release.publishedAt.toISOString() : undefined,
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

  async getOverview(projectId: string): Promise<ProjectOverviewDto> {
    const now = new Date();
    const [licenses, releaseCount, releaseStatusCounts, latestRelease, moduleCount, licenseModules, activations, activationTotal] = await Promise.all([
      this.prisma.license.findMany({
        where: { projectId },
        select: { id: true, revoked: true, expiresAt: true, maxActivations: true },
      }),
      this.prisma.release.count({ where: { projectId } }),
      this.prisma.release.groupBy({
        by: ['status'],
        where: { projectId },
        _count: { _all: true },
      }),
      this.prisma.release.findFirst({ where: { projectId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.projectModule.count({ where: { projectId } }),
      this.prisma.licenseModule.findMany({
        where: { license: { projectId } },
        select: { licenseId: true, moduleId: true, forceActivation: true, forceDeactivation: true },
      }),
      this.prisma.activation.findMany({
        where: { revoked: false, license: { projectId } },
        select: { id: true, licenseId: true, modulesRestricted: true },
      }),
      this.prisma.activation.count({ where: { license: { projectId } } }),
    ]);

    const activationCounts = await this.prisma.activation.groupBy({
      by: ['licenseId'],
      where: { revoked: false, license: { projectId } },
      _count: { _all: true },
    });

    const revokedCount = licenses.filter((license) => license.revoked).length;
    const expiredCount = licenses.filter((license) => {
      if (!license.expiresAt) return false;
      return !license.revoked && license.expiresAt < now;
    }).length;
    const activeCount = Math.max(licenses.length - revokedCount - expiredCount, 0);

    const activationCountByLicense = new Map(
      activationCounts.map((row) => [row.licenseId, row._count._all]),
    );

    let usageTotal = 0;
    let usageCount = 0;
    licenses.forEach((license) => {
      if (license.maxActivations > 0) {
        const activeActivations = activationCountByLicense.get(license.id) ?? 0;
        usageTotal += activeActivations / license.maxActivations;
        usageCount += 1;
      }
    });

    const activeLicenseModuleIds = new Set<string>();
    const forcedOnIds = new Set<string>();
    const forcedOffIds = new Set<string>();
    const licenseEnabledByLicense = new Map<string, Set<string>>();
    const licenseForcedOnByLicense = new Map<string, Set<string>>();

    licenseModules.forEach((item) => {
      if (!licenseEnabledByLicense.has(item.licenseId)) {
        licenseEnabledByLicense.set(item.licenseId, new Set());
      }
      if (!licenseForcedOnByLicense.has(item.licenseId)) {
        licenseForcedOnByLicense.set(item.licenseId, new Set());
      }
      if (!item.forceDeactivation) {
        licenseEnabledByLicense.get(item.licenseId)!.add(item.moduleId);
        activeLicenseModuleIds.add(item.moduleId);
      }
      if (item.forceActivation && !item.forceDeactivation) {
        forcedOnIds.add(item.moduleId);
        licenseForcedOnByLicense.get(item.licenseId)!.add(item.moduleId);
      }
      if (item.forceDeactivation) {
        forcedOffIds.add(item.moduleId);
      }
    });

    const restrictedActivations = activations.filter((activation) => activation.modulesRestricted).map((activation) => activation.id);
    const activationModules = restrictedActivations.length
      ? await this.prisma.activationModule.findMany({
          where: { activationId: { in: restrictedActivations } },
          select: { activationId: true, moduleId: true },
        })
      : [];

    const activationModulesByActivation = new Map<string, Set<string>>();
    activationModules.forEach((item) => {
      if (!activationModulesByActivation.has(item.activationId)) {
        activationModulesByActivation.set(item.activationId, new Set());
      }
      activationModulesByActivation.get(item.activationId)!.add(item.moduleId);
    });

    const usedModuleIds = new Set<string>();
    activations.forEach((activation) => {
      if (activation.modulesRestricted) {
        const activationModuleIds = activationModulesByActivation.get(activation.id) ?? new Set();
        activationModuleIds.forEach((moduleId) => usedModuleIds.add(moduleId));
        const forcedOnForLicense = licenseForcedOnByLicense.get(activation.licenseId) ?? new Set();
        forcedOnForLicense.forEach((moduleId) => usedModuleIds.add(moduleId));
        return;
      }
      const licenseModuleIds = licenseEnabledByLicense.get(activation.licenseId) ?? new Set();
      licenseModuleIds.forEach((moduleId) => usedModuleIds.add(moduleId));
    });

    const releaseCounts = new Map(
      releaseStatusCounts.map((row) => [row.status, row._count._all]),
    );

    return {
      licenses: {
        total: licenses.length,
        active: activeCount,
        revoked: revokedCount,
        expired: expiredCount,
        avg_usage_percent: usageCount ? Math.round((usageTotal / usageCount) * 100) : 0,
      },
      activations: {
        total: activationTotal,
        active: activations.length,
        revoked: Math.max(activationTotal - activations.length, 0),
      },
      releases: {
        total: releaseCount,
        published: releaseCounts.get('published') ?? 0,
        draft: releaseCounts.get('draft') ?? 0,
        deprecated: releaseCounts.get('deprecated') ?? 0,
        latest_version: latestRelease?.version,
        latest_channel: latestRelease?.channel ?? undefined,
        latest_published_at: latestRelease?.publishedAt?.toISOString(),
      },
      modules: {
        total: moduleCount,
        active_in_licenses: activeLicenseModuleIds.size,
        forced_on: forcedOnIds.size,
        forced_off: forcedOffIds.size,
        used_in_activations: usedModuleIds.size,
      },
    };
  }
  async listModules(projectId: string): Promise<ProjectModuleDto[]> {
    const modules = await this.prisma.projectModule.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    return modules.map((module) => this.mapModule(module));
  }

  async createModule(projectId: string, body: CreateProjectModuleRequestDto): Promise<ProjectModuleDto> {
    try {
      const module = await this.prisma.projectModule.create({
        data: {
          projectId,
          key: body.key.trim(),
          name: body.name.trim(),
          description: body.description?.trim() || null,
          params: this.normalizeParams(body.params),
        },
      });
      return this.mapModule(module);
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new HttpException('module_key_exists', HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async updateModule(
    projectId: string,
    moduleId: string,
    body: UpdateProjectModuleRequestDto,
  ): Promise<ProjectModuleDto> {
    const module = await this.prisma.projectModule.findFirst({
      where: { id: moduleId, projectId },
    });
    if (!module) {
      throw new HttpException('module_not_found', HttpStatus.NOT_FOUND);
    }
    const updated = await this.prisma.projectModule.update({
      where: { id: module.id },
      data: {
        name: body.name?.trim() || undefined,
        description: body.description?.trim() || null,
        params: this.normalizeParams(body.params),
      },
    });
    return this.mapModule(updated);
  }

  async deleteModule(projectId: string, moduleId: string): Promise<{ deleted: boolean }> {
    const module = await this.prisma.projectModule.findFirst({
      where: { id: moduleId, projectId },
    });
    if (!module) {
      throw new HttpException('module_not_found', HttpStatus.NOT_FOUND);
    }
    await this.prisma.projectModule.delete({ where: { id: module.id } });
    return { deleted: true };
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
      orderBy: { createdAt: 'desc' },
    });

    return releases.map((release) => this.mapRelease(release));
  }

  async createRelease(projectId: string, body: CreateReleaseRequestDto): Promise<ReleaseListItemDto> {
    const existing = await this.prisma.release.findFirst({ where: { projectId, version: body.version } });
    if (existing) {
      throw new HttpException('release_version_exists', HttpStatus.CONFLICT);
    }
    const status = (body.status ?? 'published') as 'draft' | 'published' | 'deprecated';
    if (status !== 'draft' && !body.channel) {
      throw new HttpException('channel_required', HttpStatus.BAD_REQUEST);
    }
    const publishedAt = status === 'published' ? new Date() : undefined;
    const release = await this.prisma.release.create({
      data: {
        projectId,
        version: body.version,
        channel: body.channel ? (body.channel as $Enums.Channel) : undefined,
        status,
        notes: body.notes ?? null,
        publishedAt,
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
    body: { version: string; channel?: string; notes?: string; status?: string },
    file: UploadedReleaseFile,
  ): Promise<ReleaseListItemDto> {
    if (!file) {
      throw new HttpException('file_required', HttpStatus.BAD_REQUEST);
    }
    if (!body.version) {
      throw new HttpException('invalid_release', HttpStatus.BAD_REQUEST);
    }
    if (body.channel && !['stable', 'beta', 'hotfix'].includes(body.channel)) {
      throw new HttpException('invalid_channel', HttpStatus.BAD_REQUEST);
    }
    const status = (body.status ?? 'published') as 'draft' | 'published' | 'deprecated';
    if (status !== 'draft' && !body.channel) {
      throw new HttpException('channel_required', HttpStatus.BAD_REQUEST);
    }
    const existing = await this.prisma.release.findFirst({ where: { projectId, version: body.version } });
    if (existing) {
      throw new HttpException('release_version_exists', HttpStatus.CONFLICT);
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
    const publishedAt = status === 'published' ? new Date() : undefined;
    const release = await this.prisma.release.create({
      data: {
        projectId,
        version: body.version,
        channel: body.channel ? (body.channel as $Enums.Channel) : undefined,
        status,
        notes: body.notes ?? null,
        publishedAt,
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
    const release = await this.prisma.release.findFirst({
      where: { id: releaseId, projectId },
      include: { asset: true },
    });
    if (!release) {
      throw new HttpException('release_not_found', HttpStatus.NOT_FOUND);
    }
    const nextStatus = (body.status ?? 'published') as 'published' | 'deprecated';
    if (nextStatus === 'published' && !body.channel) {
      throw new HttpException('channel_required', HttpStatus.BAD_REQUEST);
    }
    const nextChannel = body.channel ? (body.channel as $Enums.Channel) : release.channel;
    const updated = await this.prisma.release.update({
      where: { id: release.id },
      data: {
        channel: nextChannel ?? undefined,
        status: nextStatus,
        publishedAt: nextStatus === 'published' ? new Date() : release.publishedAt,
      },
      include: { asset: true },
    });
    return this.mapRelease(updated);
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











