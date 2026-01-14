import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { UpdatesService } from './updates.service';
import { LatestUpdateQueryDto, LatestUpdateResponseDto } from '../licensing/licensing.types';
import { DownloadTokenRequestDto, DownloadTokenResponseDto } from './updates.types';

@ApiTags('updates')
@Controller('updates')
export class UpdatesController {
  constructor(private readonly updatesService: UpdatesService) {}

  @Get('latest')
  @ApiQuery({ name: 'project_id', required: true })
  @ApiQuery({ name: 'channel', required: true })
  @ApiQuery({ name: 'current_version', required: false })
  async latest(@Query() query: LatestUpdateQueryDto): Promise<LatestUpdateResponseDto> {
    return this.updatesService.latest(query);
  }

  @Get('download/:asset_id')
  @ApiParam({ name: 'asset_id' })
  @ApiQuery({ name: 'token', required: false })
  async download(
    @Param('asset_id') assetId: string,
    @Query('token') token: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    this.updatesService.authorizeDownload(assetId, req.headers.authorization, token);
    const asset = await this.updatesService.download(assetId);
    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('Content-Disposition', `attachment; filename=${asset.filename}`);
    res.send(asset.buffer);
  }

  @Post('download-token')
  async createDownloadToken(
    @Body() body: DownloadTokenRequestDto,
  ): Promise<DownloadTokenResponseDto> {
    return this.updatesService.createDownloadToken(body.asset_id, body.receipt, body.device_id);
  }
}
