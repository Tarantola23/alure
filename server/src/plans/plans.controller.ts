import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
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
  async create(@Body() body: CreatePlanDto): Promise<PlanDto> {
    return this.plansService.createPlan(body);
  }

  @Put(':planId')
  async update(@Param('planId') planId: string, @Body() body: UpdatePlanDto): Promise<PlanDto> {
    return this.plansService.updatePlan(planId, body);
  }

  @Delete(':planId')
  async remove(@Param('planId') planId: string): Promise<{ deleted: boolean }> {
    return this.plansService.deletePlan(planId);
  }
}
