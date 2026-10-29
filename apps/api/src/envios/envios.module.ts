import { Module } from '@nestjs/common';
import { RecomendacoesModule } from '../recomendacoes/recomendacoes.module';
import { EmailService } from './email.service';
import { EnviosController } from './envios.controller';
import { EnviosService } from './envios.service';

@Module({
  imports: [RecomendacoesModule],
  controllers: [EnviosController],
  providers: [EnviosService, EmailService],
})
export class EnviosModule {}
