import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const CHANNELS = ['stable', 'beta', 'hotfix'] as const;

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

  @ApiProperty({ enum: CHANNELS, example: 'stable' })
  @IsString()
  @IsNotEmpty()
  @IsIn(CHANNELS)
  channel: string;

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

  @ApiProperty({ enum: CHANNELS })
  @IsString()
  channel: string;

  @ApiProperty()
  @IsString()
  published_at: string;

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
  @ApiProperty({ enum: CHANNELS, example: 'stable' })
  @IsString()
  @IsNotEmpty()
  @IsIn(CHANNELS)
  channel: string;
}
