import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class PlanDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: [String] })
  allowed_channels: string[];

  @ApiProperty()
  max_activations_default: number;

  @ApiProperty()
  grace_period_days: number;

  @ApiPropertyOptional()
  duration_days_default?: number;

  @ApiProperty()
  created_at: string;

  @ApiProperty()
  updated_at: string;
}

export class CreatePlanDto {
  @ApiProperty({ example: 'basic' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ type: [String], example: ['stable'] })
  @IsArray()
  allowed_channels: string[];

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  max_activations_default: number;

  @ApiProperty({ example: 14 })
  @IsInt()
  @Min(0)
  grace_period_days: number;

  @ApiPropertyOptional({ example: 365 })
  @IsOptional()
  @IsInt()
  @Min(0)
  duration_days_default?: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  allowed_channels?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  max_activations_default?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  grace_period_days?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  duration_days_default?: number;
}
