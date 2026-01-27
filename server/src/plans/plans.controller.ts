import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CreatePlanDto, PlanDto, UpdatePlanDto } from './plans.types';
import { PlansService } from './plans.service';

@ApiTags('plans')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  async list(): Promise<PlanDto[]> {
    return this.plansService.listPlans();
  }

  @Post()
  async create(@Req() req: { user?: { role: string } }, @Body() body: CreatePlanDto): Promise<PlanDto> {
    this.assertAdmin(req);
    return this.plansService.createPlan(body);
  }

  @Put(':planId')
  async update(
    @Req() req: { user?: { role: string } },
    @Param('planId') planId: string,
    @Body() body: UpdatePlanDto,
  ): Promise<PlanDto> {
    this.assertAdmin(req);
    return this.plansService.updatePlan(planId, body);
  }

  @Delete(':planId')
  async remove(@Req() req: { user?: { role: string } }, @Param('planId') planId: string): Promise<{ deleted: boolean }> {
    this.assertAdmin(req);
    return this.plansService.deletePlan(planId);
  }

  private assertAdmin(req: { user?: { role: string } }): void {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('admin_only');
    }
  }
}
