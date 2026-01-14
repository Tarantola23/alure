import { Module, OnModuleInit } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  controllers: [PlansController],
  providers: [PlansService],
})
export class PlansModule implements OnModuleInit {
  constructor(private readonly plansService: PlansService) {}

  async onModuleInit(): Promise<void> {
    await this.plansService.ensureDefaultPlans();
  }
}
