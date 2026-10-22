import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TemplatesController } from './templates.controller';
import { TemplatesRepository } from './templates.repository';
import { TemplatesPgRepository } from './templates.repository.pg';
import { TemplateApplyService } from './template-apply.service';
import { TemplatesService } from './templates.service';

@Module({
  imports: [AuthModule],
  controllers: [TemplatesController],
  providers: [
    TemplatesService,
    TemplateApplyService,
    { provide: TemplatesRepository, useClass: TemplatesPgRepository },
  ],
  exports: [TemplatesRepository, TemplateApplyService],
})
export class TemplatesModule {}
