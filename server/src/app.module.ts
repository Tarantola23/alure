import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { LicensingModule } from './licensing/licensing.module';
import { PlansModule } from './plans/plans.module';
import { ProjectsModule } from './projects/projects.module';
import { UpdatesModule } from './updates/updates.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule, PlansModule, LicensingModule, ProjectsModule, UpdatesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
