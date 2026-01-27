import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { LicensingService } from './licensing.service';
import { AuthService } from '../auth/auth.service';
import {
  ActivateRequestDto,
  ActivateResponseDto,
  ActivationListItemDto,
  ActivationModulesResponseDto,
  BulkCreateLicensesRequestDto,
  BulkCreateLicensesResponseDto,
  CreateLicenseRequestDto,
  CreateLicenseResponseDto,
  LicenseModulesResponseDto,
  LicenseListItemDto,
  RevokeRequestDto,
  RevokeResponseDto,
  UpdateLicenseModulesRequestDto,
  UpdateActivationModulesRequestDto,
  RevealActivationHostnameRequestDto,
  RevealActivationHostnameResponseDto,
  VerifyRequestDto,
  VerifyResponseDto,
} from './licensing.types';

@ApiTags('licensing')
@Controller('licenses')
export class LicensingController {
  constructor(
    private readonly licensingService: LicensingService,
    private readonly authService: AuthService,
  ) {}

  @Post('activate')
  async activate(@Body() body: ActivateRequestDto): Promise<ActivateResponseDto> {
    return this.licensingService.activate(body);
  }

  @Post('verify')
  async verify(@Body() body: VerifyRequestDto): Promise<VerifyResponseDto> {
    return this.licensingService.verify(body);
  }

  @Post('revoke')
  @UseGuards(AuthGuard)
  async revoke(@Req() req: { user?: { role: string } }, @Body() body: RevokeRequestDto): Promise<RevokeResponseDto> {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('admin_only');
    }
    return this.licensingService.revoke(body);
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiQuery({ name: 'project_id', required: false })
  async listLicenses(@Query('project_id') projectId?: string): Promise<LicenseListItemDto[]> {
    return this.licensingService.listLicenses(projectId);
  }

  @Post()
  @UseGuards(AuthGuard)
  async createLicense(
    @Req() req: { user?: { role: string } },
    @Body() body: CreateLicenseRequestDto,
  ): Promise<CreateLicenseResponseDto> {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('admin_only');
    }
    return this.licensingService.createLicense(body);
  }

  @UseGuards(AuthGuard)
  @Post('bulk')
  async bulkCreate(@Req() req: { user?: { role: string } }, @Body() body: BulkCreateLicensesRequestDto): Promise<BulkCreateLicensesResponseDto> {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('admin_only');
    }
    return this.licensingService.createBulkLicenses(body);
  }

  @Get(':licenseId/activations')
  @UseGuards(AuthGuard)
  @ApiParam({ name: 'licenseId' })
  async listActivations(@Param('licenseId') licenseId: string): Promise<ActivationListItemDto[]> {
    return this.licensingService.listActivations(licenseId);
  }

  @Get(':licenseId/modules')
  @UseGuards(AuthGuard)
  @ApiParam({ name: 'licenseId' })
  async getLicenseModules(
    @Req() req: { user?: { role: string } },
    @Param('licenseId') licenseId: string,
  ): Promise<LicenseModulesResponseDto> {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('admin_only');
    }
    return this.licensingService.getLicenseModules(licenseId);
  }

  @Post(':licenseId/modules')
  @UseGuards(AuthGuard)
  @ApiParam({ name: 'licenseId' })
  async updateLicenseModules(
    @Req() req: { user?: { role: string } },
    @Param('licenseId') licenseId: string,
    @Body() body: UpdateLicenseModulesRequestDto,
  ): Promise<LicenseModulesResponseDto> {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('admin_only');
    }
    return this.licensingService.updateLicenseModules(licenseId, body);
  }

  @Get(':licenseId/activations/:activationId/modules')
  @UseGuards(AuthGuard)
  @ApiParam({ name: 'licenseId' })
  @ApiParam({ name: 'activationId' })
  async getActivationModules(
    @Req() req: { user?: { role: string } },
    @Param('licenseId') licenseId: string,
    @Param('activationId') activationId: string,
  ): Promise<ActivationModulesResponseDto> {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('admin_only');
    }
    return this.licensingService.getActivationModules(licenseId, activationId);
  }

  @Post(':licenseId/activations/:activationId/modules')
  @UseGuards(AuthGuard)
  @ApiParam({ name: 'licenseId' })
  @ApiParam({ name: 'activationId' })
  async updateActivationModules(
    @Req() req: { user?: { role: string } },
    @Param('licenseId') licenseId: string,
    @Param('activationId') activationId: string,
    @Body() body: UpdateActivationModulesRequestDto,
  ): Promise<ActivationModulesResponseDto> {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('admin_only');
    }
    return this.licensingService.updateActivationModules(licenseId, activationId, body);
  }

  @Post(':licenseId/activations/:activationId/hostname')
  @UseGuards(AuthGuard)
  @ApiParam({ name: 'licenseId' })
  @ApiParam({ name: 'activationId' })
  async revealActivationHostname(
    @Req() req: { user?: { sub: string } },
    @Param('licenseId') licenseId: string,
    @Param('activationId') activationId: string,
    @Body() body: RevealActivationHostnameRequestDto,
  ): Promise<RevealActivationHostnameResponseDto> {
    if (!req.user?.sub) {
      throw new ForbiddenException('auth_required');
    }
    const ok = await this.authService.verifyPassword(req.user.sub, body.password);
    if (!ok) {
      throw new ForbiddenException('invalid_password');
    }
    return this.licensingService.revealActivationHostname(licenseId, activationId);
  }
}
