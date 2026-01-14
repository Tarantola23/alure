import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class ActivateRequestDto {
  @ApiProperty({ example: 'ALR-AB12CD-34EF56-7890AB' })
  @IsString()
  @IsNotEmpty()
  license_key: string;

  @ApiProperty({ example: 'device-123' })
  @IsString()
  @IsNotEmpty()
  device_id: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsString()
  @IsOptional()
  app_version?: string;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  device_meta?: Record<string, unknown>;
}

export class ActivateResponseDto {
  @ApiProperty()
  @IsString()
  receipt: string;

  @ApiProperty()
  @IsString()
  activation_id: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  expires_at?: string;

  @ApiProperty()
  @IsNotEmpty()
  grace_period_days: number;

  @ApiProperty()
  @IsString()
  server_time: string;
}

export class VerifyRequestDto {
  @ApiProperty({ example: 'rcpt_123' })
  @IsString()
  @IsNotEmpty()
  receipt: string;

  @ApiProperty({ example: 'device-123' })
  @IsString()
  @IsNotEmpty()
  device_id: string;
}

export class VerifyResponseDto {
  @ApiProperty()
  @IsBoolean()
  valid: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  new_receipt?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  expires_at?: string;

  @ApiProperty()
  @IsString()
  server_time: string;
}

export class RevokeRequestDto {
  @ApiPropertyOptional({ example: 'license-id-123' })
  @IsString()
  @IsOptional()
  license_id?: string;

  @ApiPropertyOptional({ example: 'activation-id-456' })
  @IsString()
  @IsOptional()
  activation_id?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reason?: string;
}

export class RevokeResponseDto {
  @ApiProperty()
  @IsBoolean()
  revoked: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  server_time?: string;
}

export class CreateLicenseRequestDto {
  @ApiProperty({ example: 'project-demo' })
  @IsString()
  @IsNotEmpty()
  project_id: string;

  @ApiProperty({ example: 'basic' })
  @IsString()
  @IsNotEmpty()
  plan: string;

  @ApiProperty({ minimum: 0, example: 1 })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  max_activations: number;

  @ApiPropertyOptional({ example: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration_days?: number;

  @ApiPropertyOptional({ example: 'Annual seat license' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateLicenseResponseDto {
  @ApiProperty()
  @IsString()
  license_id: string;

  @ApiProperty()
  @IsString()
  license_key: string;
}

export class LicenseListItemDto {
  @ApiProperty()
  @IsString()
  license_id: string;

  @ApiProperty()
  @IsString()
  project_id: string;

  @ApiProperty()
  @IsString()
  plan: string;

  @ApiProperty({ minimum: 0 })
  @IsNotEmpty()
  max_activations: number;

  @ApiProperty()
  @IsBoolean()
  revoked: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  duration_days?: number;

  @ApiPropertyOptional()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  expires_at?: string;

  @ApiProperty()
  @IsString()
  created_at: string;
}

export class ActivationListItemDto {
  @ApiProperty()
  @IsString()
  activation_id: string;

  @ApiProperty()
  @IsString()
  device_id_hash: string;

  @ApiProperty()
  @IsBoolean()
  revoked: boolean;

  @ApiProperty()
  @IsString()
  created_at: string;
}

export const CHANNELS = ['stable', 'beta', 'hotfix'] as const;
export type Channel = (typeof CHANNELS)[number];

export class LatestUpdateQueryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  project_id: string;

  @ApiProperty({ enum: CHANNELS })
  @IsString()
  @IsIn(CHANNELS)
  channel: Channel;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  current_version?: string;
}

export class ReleaseDto {
  @ApiProperty()
  @IsString()
  release_id: string;

  @ApiProperty()
  @IsString()
  version: string;

  @ApiProperty({ enum: CHANNELS })
  @IsString()
  @IsIn(CHANNELS)
  channel: Channel;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  published_at?: string;
}

export class AssetDto {
  @ApiProperty()
  @IsString()
  asset_id: string;

  @ApiProperty()
  @IsString()
  filename: string;

  @ApiProperty()
  @IsNotEmpty()
  size_bytes: number;

  @ApiProperty()
  @IsString()
  sha256: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  download_url?: string;
}

export class LatestUpdateResponseDto {
  @ApiProperty()
  @IsBoolean()
  update_available: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  latest_version?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  release_notes?: string;

  @ApiPropertyOptional({ type: () => ReleaseDto })
  @IsObject()
  @IsOptional()
  release?: ReleaseDto;

  @ApiPropertyOptional({ type: () => AssetDto })
  @IsObject()
  @IsOptional()
  asset?: AssetDto;

  @ApiProperty()
  @IsString()
  server_time: string;
}
