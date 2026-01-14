import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DownloadTokenRequestDto {
  @ApiProperty({ example: 'rcpt_v1...' })
  @IsString()
  @IsNotEmpty()
  receipt: string;

  @ApiProperty({ example: 'device-123' })
  @IsString()
  @IsNotEmpty()
  device_id: string;

  @ApiProperty({ example: 'asset-id-123' })
  @IsString()
  @IsNotEmpty()
  asset_id: string;
}

export class DownloadTokenResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  token: string;

  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  expires_at: string;
}
