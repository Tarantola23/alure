import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class UserProfileDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  role: string;
}

export class LoginRequestDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @MinLength(4)
  password: string;
}

export class LoginResponseDto {
  @ApiProperty()
  token: string;

  @ApiProperty()
  user: UserProfileDto;
}

export class BootstrapStatusDto {
  @ApiProperty({ example: true })
  has_admin: boolean;
}

export class BootstrapRequestDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'Admin' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @MinLength(4)
  password: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Admin User' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'admin@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'newpassword' })
  @IsString()
  @IsOptional()
  @MinLength(4)
  password?: string;
}
