import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { IdParamPipe } from '../common/pipes/id-param.pipe';
import { contextoDaRequisicao } from '../common/request-context';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RecomendacoesService } from './recomendacoes.service';
import {
  generateSchema,
  recomendacaoQuerySchema,
  recusarSchema,
  type GenerateDto,
  type RecomendacaoQueryDto,
  type RecusarDto,
} from './dto/recomendacao.schemas';

@Controller('recomendacoes')
export class RecomendacoesController {
  constructor(private readonly service: RecomendacoesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(recomendacaoQuerySchema)) query: RecomendacaoQueryDto,
  ) {
    return this.service.list(user, query);
  }

  // Antes de ':id' para não ser capturada como id
  @Get('oportunidades-do-dia')
  oportunidadesDoDia(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.service.oportunidadesDoDia(user, contextoDaRequisicao(req));
  }

  @Get(':id')
  findById(@CurrentUser() user: AuthUser, @Param('id', IdParamPipe) id: string) {
    return this.service.findById(user, id);
  }

  @Post('generate')
  @Roles('ADMIN', 'ASSESSOR')
  @HttpCode(HttpStatus.OK)
  generate(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(generateSchema)) body: GenerateDto,
    @Req() req: Request,
  ) {
    return this.service.generate(user, body, contextoDaRequisicao(req));
  }

  @Patch(':id/aprovar')
  @Roles('ADMIN', 'ASSESSOR')
  aprovar(
    @CurrentUser() user: AuthUser,
    @Param('id', IdParamPipe) id: string,
    @Req() req: Request,
  ) {
    return this.service.aprovar(user, id, contextoDaRequisicao(req));
  }

  @Patch(':id/recusar')
  @Roles('ADMIN', 'ASSESSOR')
  recusar(
    @CurrentUser() user: AuthUser,
    @Param('id', IdParamPipe) id: string,
    @Body(new ZodValidationPipe(recusarSchema)) body: RecusarDto,
    @Req() req: Request,
  ) {
    return this.service.recusar(user, id, body, contextoDaRequisicao(req));
  }
}
