import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class SmtpSettingsDto {
  @ApiProperty()
  host: string;

  @ApiProperty()
  port: number;

  @ApiProperty()
  username: string;

  @ApiProperty()
  from_email: string;

  @ApiPropertyOptional()
  from_name?: string;

  @ApiProperty()
  secure: boolean;

  @ApiProperty()
  has_password: boolean;

  @ApiProperty()
  verified: boolean;

  @ApiPropertyOptional()
  verified_at?: string;
}

export class UpdateSmtpSettingsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  host: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  port: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  password?: string;

  @ApiProperty()
  @IsEmail()
  from_email: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from_name?: string;

  @ApiProperty()
  @IsBoolean()
  secure: boolean;
}

export class TestEmailResponseDto {
  @ApiProperty()
  sent: boolean;
}

export class VerifySmtpCodeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class VerifySmtpResponseDto {
  @ApiProperty()
  verified: boolean;
}
