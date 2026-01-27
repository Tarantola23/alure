import { Module } from '@nestjs/common';
import { LicensingController } from './licensing.controller';
import { LicensingService } from './licensing.service';
import { SmtpModule } from '../smtp/smtp.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [SmtpModule, AuthModule],
  controllers: [LicensingController],
  providers: [LicensingService],
  exports: [LicensingService],
})
export class LicensingModule {}
