import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

const CHANNELS = ['stable', 'beta', 'hotfix'] as const;
const RELEASE_STATUSES = ['draft', 'published', 'deprecated'] as const;

export class CreateProjectRequestDto {
  @ApiProperty({ example: 'Desktop Suite' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class ProjectDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  created_at: string;

  @ApiProperty()
  @IsString()
  updated_at: string;
}

export class CreateReleaseRequestDto {
  @ApiProperty({ example: '1.0.0' })
  @IsString()
  @IsNotEmpty()
  version: string;

  @ApiPropertyOptional({ enum: CHANNELS, example: 'stable' })
  @IsString()
  @IsOptional()
  @IsIn(CHANNELS)
  channel?: string;

  @ApiPropertyOptional({ enum: RELEASE_STATUSES, example: 'published' })
  @IsString()
  @IsOptional()
  @IsIn(RELEASE_STATUSES)
  status?: string;

  @ApiPropertyOptional({ example: 'Initial release' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    type: 'object',
    properties: {
      filename: { type: 'string', example: 'app.zip' },
      size_bytes: { type: 'number', example: 1024 },
      sha256: { type: 'string', example: 'sha256hash' },
    },
  })
  asset?: {
    filename: string;
    size_bytes: number;
    sha256: string;
  };
}

export class ReleaseListItemDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  version: string;

  @ApiPropertyOptional({ enum: CHANNELS })
  @IsString()
  @IsOptional()
  channel?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  published_at?: string;

  @ApiProperty({ enum: RELEASE_STATUSES })
  @IsString()
  status: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    type: 'object',
    properties: {
      id: { type: 'string' },
      filename: { type: 'string' },
      size_bytes: { type: 'number' },
      sha256: { type: 'string' },
      download_url: { type: 'string' },
    },
  })
  asset?: {
    id: string;
    filename: string;
    size_bytes: number;
    sha256: string;
    download_url: string;
  };
}

export class PromoteReleaseRequestDto {
  @ApiPropertyOptional({ enum: CHANNELS, example: 'stable' })
  @IsString()
  @IsOptional()
  @IsIn(CHANNELS)
  channel?: string;

  @ApiPropertyOptional({ enum: RELEASE_STATUSES, example: 'published' })
  @IsString()
  @IsOptional()
  @IsIn(RELEASE_STATUSES)
  status?: string;
}

export class ProjectModuleDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  key: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  params?: Record<string, string>;

  @ApiProperty()
  @IsString()
  created_at: string;
}

export class CreateProjectModuleRequestDto {
  @ApiProperty({ example: 'telemetry' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ example: 'Telemetry' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Usage tracking toggle' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  params?: Record<string, string>;
}

export class UpdateProjectModuleRequestDto {
  @ApiPropertyOptional({ example: 'Telemetry' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Usage tracking toggle' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  params?: Record<string, string>;
}

export class ProjectOverviewLicensesDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  active: number;

  @ApiProperty()
  revoked: number;

  @ApiProperty()
  expired: number;

  @ApiProperty()
  avg_usage_percent: number;
}

export class ProjectOverviewReleasesDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  published: number;

  @ApiProperty()
  draft: number;

  @ApiProperty()
  deprecated: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  latest_version?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  latest_channel?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  latest_published_at?: string;
}

export class ProjectOverviewActivationsDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  active: number;

  @ApiProperty()
  revoked: number;
}

export class ProjectOverviewModulesDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  active_in_licenses: number;

  @ApiProperty()
  forced_on: number;

  @ApiProperty()
  forced_off: number;

  @ApiProperty()
  used_in_activations: number;
}

export class ProjectOverviewDto {
  @ApiProperty({ type: ProjectOverviewLicensesDto })
  @IsObject()
  licenses: ProjectOverviewLicensesDto;

  @ApiProperty({ type: ProjectOverviewReleasesDto })
  @IsObject()
  releases: ProjectOverviewReleasesDto;

  @ApiProperty({ type: ProjectOverviewActivationsDto })
  @IsObject()
  activations: ProjectOverviewActivationsDto;

  @ApiProperty({ type: ProjectOverviewModulesDto })
  @IsObject()
  modules: ProjectOverviewModulesDto;
}






