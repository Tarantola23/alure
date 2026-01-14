import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LicensingService } from './licensing.service';
import {
  ActivateRequestDto,
  ActivateResponseDto,
  ActivationListItemDto,
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

  @Get(':licenseId/activations')
  @ApiParam({ name: 'licenseId' })
  async listActivations(@Param('licenseId') licenseId: string): Promise<ActivationListItemDto[]> {
    return this.licensingService.listActivations(licenseId);
  }
}
