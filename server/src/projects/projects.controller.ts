import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiParam, ApiTags } from '@nestjs/swagger';
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
import { AuthGuard } from '../auth/auth.guard';
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

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async listProjects(): Promise<ProjectDto[]> {
    return this.projectsService.listProjects();
  }

  @Get(':projectId/overview')
  @ApiParam({ name: 'projectId' })
  async getOverview(@Param('projectId') projectId: string): Promise<ProjectOverviewDto> {
    return this.projectsService.getOverview(projectId);
  }
  @Get(':projectId/modules')
  @ApiParam({ name: 'projectId' })
  async listModules(@Param('projectId') projectId: string): Promise<ProjectModuleDto[]> {
    return this.projectsService.listModules(projectId);
  }

  @Post()
  async createProject(@Req() req: { user?: { role: string } }, @Body() body: CreateProjectRequestDto): Promise<ProjectDto> {
    this.assertAdmin(req);
    return this.projectsService.createProject(body);
  }

  @Post(':projectId/modules')
  @ApiParam({ name: 'projectId' })
  async createModule(
    @Req() req: { user?: { role: string } },
    @Param('projectId') projectId: string,
    @Body() body: CreateProjectModuleRequestDto,
  ): Promise<ProjectModuleDto> {
    this.assertAdmin(req);
    return this.projectsService.createModule(projectId, body);
  }

  @Put(':projectId/modules/:moduleId')
  @ApiParam({ name: 'projectId' })
  @ApiParam({ name: 'moduleId' })
  async updateModule(
    @Req() req: { user?: { role: string } },
    @Param('projectId') projectId: string,
    @Param('moduleId') moduleId: string,
    @Body() body: UpdateProjectModuleRequestDto,
  ): Promise<ProjectModuleDto> {
    this.assertAdmin(req);
    return this.projectsService.updateModule(projectId, moduleId, body);
  }

  @Delete(':projectId/modules/:moduleId')
  @ApiParam({ name: 'projectId' })
  @ApiParam({ name: 'moduleId' })
  async deleteModule(
    @Req() req: { user?: { role: string } },
    @Param('projectId') projectId: string,
    @Param('moduleId') moduleId: string,
  ): Promise<{ deleted: boolean }> {
    this.assertAdmin(req);
    return this.projectsService.deleteModule(projectId, moduleId);
  }

  @Delete(':projectId')
  @ApiParam({ name: 'projectId' })
  async deleteProject(@Req() req: { user?: { role: string } }, @Param('projectId') projectId: string): Promise<{ deleted: boolean }> {
    this.assertAdmin(req);
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
    @Req() req: { user?: { role: string } },
    @Param('projectId') projectId: string,
    @Body() body: CreateReleaseRequestDto,
  ): Promise<ReleaseListItemDto> {
    this.assertAdmin(req);
    return this.projectsService.createRelease(projectId, body);
  }

  @Post(':projectId/releases/upload')
  @ApiParam({ name: 'projectId' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'version'],
      properties: {
        file: { type: 'string', format: 'binary' },
        version: { type: 'string' },
        channel: { type: 'string', enum: ['stable', 'beta', 'hotfix'] },
        status: { type: 'string', enum: ['draft', 'published', 'deprecated'] },
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
    @Req() req: { user?: { role: string } },
    @Param('projectId') projectId: string,
    @UploadedFile() file: UploadedReleaseFile,
    @Body() body: { version: string; channel?: string; notes?: string; status?: string },
  ): Promise<ReleaseListItemDto> {
    this.assertAdmin(req);
    return this.projectsService.createReleaseWithUpload(projectId, body, file);
  }

  @Post(':projectId/releases/:releaseId/promote')
  @ApiParam({ name: 'projectId' })
  @ApiParam({ name: 'releaseId' })
  async promoteRelease(
    @Req() req: { user?: { role: string } },
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
    @Body() body: PromoteReleaseRequestDto,
  ): Promise<ReleaseListItemDto> {
    this.assertAdmin(req);
    return this.projectsService.promoteRelease(projectId, releaseId, body);
  }

  private assertAdmin(req: { user?: { role: string } }): void {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('admin_only');
    }
  }
}






