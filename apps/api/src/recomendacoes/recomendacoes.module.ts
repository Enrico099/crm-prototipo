import { Module } from '@nestjs/common';
import { AiEngineService } from './ai-engine.service';
import { RecomendacoesController } from './recomendacoes.controller';
import { RecomendacoesService } from './recomendacoes.service';

@Module({
  controllers: [RecomendacoesController],
  providers: [RecomendacoesService, AiEngineService],
  exports: [AiEngineService, RecomendacoesService],
})
export class RecomendacoesModule {}
