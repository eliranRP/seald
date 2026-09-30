import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { TemplatesController } from './templates.controller';
import { TemplatesRepository } from './templates.repository';
import { TemplatesPgRepository } from './templates.repository.pg';
import { TemplatesService } from './templates.service';
import { TemplateApplyService } from './template-apply.service';

@Module({
  imports: [AuthModule, EnvelopesModule],
  controllers: [TemplatesController],
  providers: [
    TemplatesService,
    TemplateApplyService,
    { provide: TemplatesRepository, useClass: TemplatesPgRepository },
  ],
  exports: [TemplatesRepository, TemplateApplyService],
})
export class TemplatesModule {}
