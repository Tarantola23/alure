import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto, PlanDto, UpdatePlanDto } from './plans.types';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultPlans(): Promise<void> {
    const defaults = [
      {
        name: 'basic',
        allowed_channels: ['stable'],
        max_activations_default: 1,
        grace_period_days: 7,
        duration_days_default: 365,
      },
      {
        name: 'pro',
        allowed_channels: ['stable', 'beta'],
        max_activations_default: 3,
        grace_period_days: 14,
        duration_days_default: 365,
      },
      {
        name: 'enterprise',
        allowed_channels: ['stable', 'beta', 'hotfix'],
        max_activations_default: 10,
        grace_period_days: 30,
        duration_days_default: 365,
      },
    ];

    for (const plan of defaults) {
      const exists = await this.prisma.plan.findUnique({ where: { name: plan.name } });
      if (!exists) {
        await this.prisma.plan.create({
          data: {
            name: plan.name,
            allowedChannels: plan.allowed_channels,
            maxActivationsDefault: plan.max_activations_default,
            gracePeriodDays: plan.grace_period_days,
            durationDaysDefault: plan.duration_days_default,
          },
        });
        continue;
      }
      if (exists.durationDaysDefault == null && plan.duration_days_default != null) {
        await this.prisma.plan.update({
          where: { id: exists.id },
          data: { durationDaysDefault: plan.duration_days_default },
        });
      }
    }
  }

  async listPlans(): Promise<PlanDto[]> {
    const plans = await this.prisma.plan.findMany({ orderBy: { createdAt: 'asc' } });
    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      allowed_channels: plan.allowedChannels as string[],
      max_activations_default: plan.maxActivationsDefault,
      grace_period_days: plan.gracePeriodDays,
      duration_days_default: plan.durationDaysDefault ?? undefined,
      created_at: plan.createdAt.toISOString(),
      updated_at: plan.updatedAt.toISOString(),
    }));
  }

  async createPlan(body: CreatePlanDto): Promise<PlanDto> {
    try {
      const plan = await this.prisma.plan.create({
        data: {
          name: body.name,
          allowedChannels: body.allowed_channels,
          maxActivationsDefault: body.max_activations_default,
          gracePeriodDays: body.grace_period_days,
          durationDaysDefault: body.duration_days_default ?? null,
        },
      });
      return {
        id: plan.id,
        name: plan.name,
        allowed_channels: plan.allowedChannels as string[],
        max_activations_default: plan.maxActivationsDefault,
        grace_period_days: plan.gracePeriodDays,
        duration_days_default: plan.durationDaysDefault ?? undefined,
        created_at: plan.createdAt.toISOString(),
        updated_at: plan.updatedAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new HttpException('plan_name_already_exists', HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async updatePlan(planId: string, body: UpdatePlanDto): Promise<PlanDto> {
    try {
      const plan = await this.prisma.plan.update({
        where: { id: planId },
        data: {
          name: body.name,
          allowedChannels: body.allowed_channels,
          maxActivationsDefault: body.max_activations_default,
          gracePeriodDays: body.grace_period_days,
          durationDaysDefault: body.duration_days_default ?? undefined,
        },
      });
      return {
        id: plan.id,
        name: plan.name,
        allowed_channels: plan.allowedChannels as string[],
        max_activations_default: plan.maxActivationsDefault,
        grace_period_days: plan.gracePeriodDays,
        duration_days_default: plan.durationDaysDefault ?? undefined,
        created_at: plan.createdAt.toISOString(),
        updated_at: plan.updatedAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new HttpException('plan_not_found', HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }

  async deletePlan(planId: string): Promise<{ deleted: boolean }> {
    try {
      await this.prisma.plan.delete({ where: { id: planId } });
      return { deleted: true };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new HttpException('plan_not_found', HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }
}
