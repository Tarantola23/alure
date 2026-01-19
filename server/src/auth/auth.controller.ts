import { Body, Controller, ForbiddenException, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import {
  AcceptInviteRequestDto,
  AcceptInviteResponseDto,
  BootstrapRequestDto,
  BootstrapStatusDto,
  CreateUserRequestDto,
  CreateUserResponseDto,
  LoginRequestDto,
  LoginResponseDto,
  UpdateProfileDto,
  UserProfileDto,
} from './auth.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async me(@Req() req: { user: { sub: string } }): Promise<UserProfileDto> {
    return this.authService.getProfile(req.user.sub);
  }

  @Put('me')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async update(@Req() req: { user: { sub: string } }, @Body() body: UpdateProfileDto): Promise<UserProfileDto> {
    return this.authService.updateProfile(req.user.sub, body);
  }

  @Post('login')
  async login(@Body() body: LoginRequestDto): Promise<LoginResponseDto> {
    return this.authService.login(body);
  }

  @Get('bootstrap')
  async bootstrapStatus(): Promise<BootstrapStatusDto> {
    const hasAdmin = await this.authService.hasAdmin();
    return { has_admin: hasAdmin };
  }

  @Post('bootstrap')
  async bootstrap(@Body() body: BootstrapRequestDto): Promise<LoginResponseDto> {
    return this.authService.bootstrapAdmin(body);
  }

  @Post('users')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async createUser(
    @Req() req: { user?: { role: string } },
    @Body() body: CreateUserRequestDto,
  ): Promise<CreateUserResponseDto> {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('admin_only');
    }
    return this.authService.createUserInvite(body);
  }

  @Post('invite/accept')
  async acceptInvite(@Body() body: AcceptInviteRequestDto): Promise<AcceptInviteResponseDto> {
    return this.authService.acceptInvite(body);
  }
}
