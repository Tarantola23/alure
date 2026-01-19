import { Body, Controller, ForbiddenException, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { SmtpService } from './smtp.service';
import { SmtpSettingsDto, TestEmailResponseDto, UpdateSmtpSettingsDto, VerifySmtpCodeDto, VerifySmtpResponseDto } from './smtp.types';

type AuthRequest = {
  user?: { email: string; role: string };
};

@ApiTags('smtp')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('smtp')
export class SmtpController {
  constructor(private readonly smtpService: SmtpService) {}

  @Get('settings')
  async getSettings(): Promise<SmtpSettingsDto | null> {
    return this.smtpService.getSettings();
  }

  @Put('settings')
  async updateSettings(@Req() req: AuthRequest, @Body() body: UpdateSmtpSettingsDto): Promise<SmtpSettingsDto> {
    this.assertAdmin(req);
    return this.smtpService.updateSettings(body);
  }

  @Post('test')
  async sendTestEmail(@Req() req: AuthRequest): Promise<TestEmailResponseDto> {
    this.assertAdmin(req);
    const email = req.user?.email;
    if (!email) {
      throw new ForbiddenException('missing_user');
    }
    await this.smtpService.sendTestEmail(email);
    return { sent: true };
  }

  @Post('verify')
  async verifyCode(@Req() req: AuthRequest, @Body() body: VerifySmtpCodeDto): Promise<VerifySmtpResponseDto> {
    this.assertAdmin(req);
    const verified = await this.smtpService.verifyCode(body.code);
    return { verified };
  }

  private assertAdmin(req: AuthRequest): void {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('admin_only');
    }
  }
}
