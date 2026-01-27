import { Body, Controller, ForbiddenException, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
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
  InviteStatusResponseDto,
  ResendInviteResponseDto,
  LoginRequestDto,
  LoginResponseDto,
  UserListItemDto,
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
    this.assertAdmin(req);
    return this.authService.createUserInvite(body);
  }

  @Get('users')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async listUsers(@Req() req: { user?: { role: string } }): Promise<UserListItemDto[]> {
    this.assertAdmin(req);
    return this.authService.listUsers();
  }

  @Post('users/:userId/resend')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async resendInvite(
    @Req() req: { user?: { role: string } },
    @Param('userId') userId: string,
  ): Promise<ResendInviteResponseDto> {
    this.assertAdmin(req);
    return this.authService.resendInvite(userId);
  }

  @Post('invite/accept')
  async acceptInvite(@Body() body: AcceptInviteRequestDto): Promise<AcceptInviteResponseDto> {
    return this.authService.acceptInvite(body);
  }

  @Get('invite/status')
  async inviteStatus(@Query('token') token: string): Promise<InviteStatusResponseDto> {
    return this.authService.getInviteStatus(token);
  }

  private assertAdmin(req: { user?: { role: string } }): void {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('admin_only');
    }
  }
}
