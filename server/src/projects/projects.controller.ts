import { Body, Controller, Delete, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiParam, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
type UploadedReleaseFile = {
  path: string;
  originalname: string;
  mimetype: string;
};
import { mkdirSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { ProjectsService } from './projects.service';
import {
  CreateProjectRequestDto,
  CreateReleaseRequestDto,
  ProjectDto,
  PromoteReleaseRequestDto,
  ReleaseListItemDto,
} from './projects.types';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async listProjects(): Promise<ProjectDto[]> {
    return this.projectsService.listProjects();
  }

  @Post()
  async createProject(@Body() body: CreateProjectRequestDto): Promise<ProjectDto> {
    return this.projectsService.createProject(body);
  }

  @Delete(':projectId')
  @ApiParam({ name: 'projectId' })
  async deleteProject(@Param('projectId') projectId: string): Promise<{ deleted: boolean }> {
    return this.projectsService.deleteProject(projectId);
  }

  @Get(':projectId/releases')
  @ApiParam({ name: 'projectId' })
  async listReleases(@Param('projectId') projectId: string): Promise<ReleaseListItemDto[]> {
    return this.projectsService.listReleases(projectId);
  }

  @Get(':projectId/releases/:releaseId')
  @ApiParam({ name: 'projectId' })
  @ApiParam({ name: 'releaseId' })
  async getRelease(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
  ): Promise<ReleaseListItemDto> {
    return this.projectsService.getRelease(projectId, releaseId);
  }

  @Post(':projectId/releases')
  @ApiParam({ name: 'projectId' })
  async createRelease(
    @Param('projectId') projectId: string,
    @Body() body: CreateReleaseRequestDto,
  ): Promise<ReleaseListItemDto> {
    return this.projectsService.createRelease(projectId, body);
  }

  @Post(':projectId/releases/upload')
  @ApiParam({ name: 'projectId' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'version', 'channel'],
      properties: {
        file: { type: 'string', format: 'binary' },
        version: { type: 'string' },
        channel: { type: 'string', enum: ['stable', 'beta', 'hotfix'] },
        notes: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const target = path.resolve(process.cwd(), process.env.ASSET_STORAGE_DIR || 'storage');
          mkdirSync(target, { recursive: true });
          cb(null, target);
        },
        filename: (_req, file, cb) => {
          const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
          cb(null, `${Date.now()}-${randomUUID()}-${safeName}`);
        },
      }),
    }),
  )
  async uploadRelease(
    @Param('projectId') projectId: string,
    @UploadedFile() file: UploadedReleaseFile,
    @Body() body: { version: string; channel: string; notes?: string },
  ): Promise<ReleaseListItemDto> {
    return this.projectsService.createReleaseWithUpload(projectId, body, file);
  }

  @Post(':projectId/releases/:releaseId/promote')
  @ApiParam({ name: 'projectId' })
  @ApiParam({ name: 'releaseId' })
  async promoteRelease(
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Body() body: PromoteReleaseRequestDto,
  ): Promise<ReleaseListItemDto> {
    return this.projectsService.promoteRelease(projectId, releaseId, body);
  }
}
