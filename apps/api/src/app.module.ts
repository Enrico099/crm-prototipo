import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { CarteiraModule } from './carteira/carteira.module';
import { ClientesModule } from './clientes/clientes.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EnviosModule } from './envios/envios.module';
import { InteracoesModule } from './interacoes/interacoes.module';
import { LeadsModule } from './leads/leads.module';
import { NotificacoesModule } from './notificacoes/notificacoes.module';
import { ProdutosModule } from './produtos/produtos.module';
import { RecomendacoesModule } from './recomendacoes/recomendacoes.module';
import { SuitabilityModule } from './suitability/suitability.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', '../../.env'],
      // Falha o boot com mensagem clara se faltar/for fraca alguma variável
      validate: validateEnv,
    }),
    PrismaModule,
    AuditoriaModule,
    AuthModule,
    CarteiraModule,
    ClientesModule,
    DashboardModule,
    EnviosModule,
    InteracoesModule,
    LeadsModule,
    NotificacoesModule,
    ProdutosModule,
    RecomendacoesModule,
    SuitabilityModule,
    UsuariosModule,
  ],
  controllers: [HealthController],
  providers: [
    // Ordem: JwtAuthGuard primeiro (autenticação), RolesGuard depois (autorização).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
