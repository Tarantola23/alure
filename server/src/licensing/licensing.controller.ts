import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { LicensingService } from './licensing.service';
import {
  ActivateRequestDto,
  ActivateResponseDto,
  ActivationListItemDto,
  BulkCreateLicensesRequestDto,
  BulkCreateLicensesResponseDto,
  CreateLicenseRequestDto,
  CreateLicenseResponseDto,
  LicenseListItemDto,
  RevokeRequestDto,
  RevokeResponseDto,
  VerifyRequestDto,
  VerifyResponseDto,
} from './licensing.types';

@ApiTags('licensing')
@Controller('licenses')
export class LicensingController {
  constructor(private readonly licensingService: LicensingService) {}

  @Post('activate')
  async activate(@Body() body: ActivateRequestDto): Promise<ActivateResponseDto> {
    return this.licensingService.activate(body);
  }

  @Post('verify')
  async verify(@Body() body: VerifyRequestDto): Promise<VerifyResponseDto> {
    return this.licensingService.verify(body);
  }

  @Post('revoke')
  async revoke(@Body() body: RevokeRequestDto): Promise<RevokeResponseDto> {
    return this.licensingService.revoke(body);
  }

  @Get()
  @ApiQuery({ name: 'project_id', required: false })
  async listLicenses(@Query('project_id') projectId?: string): Promise<LicenseListItemDto[]> {
    return this.licensingService.listLicenses(projectId);
  }

  @Post()
  async createLicense(@Body() body: CreateLicenseRequestDto): Promise<CreateLicenseResponseDto> {
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
  @ApiParam({ name: 'licenseId' })
  async listActivations(@Param('licenseId') licenseId: string): Promise<ActivationListItemDto[]> {
    return this.licensingService.listActivations(licenseId);
  }
}
