import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export type Email = { para: string; assunto: string; html: string; texto: string };

/** Transporte SMTP. Sem SMTP_URL o envio fica desligado (`configurado = false`). */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporte: Transporter | null;
  private readonly remetente: string;

  constructor(config: ConfigService) {
    const url = config.get<string>('SMTP_URL');
    this.remetente = config.get<string>('EMAIL_REMETENTE') ?? 'Capital Elite CRM <no-reply@capitalelite.com.br>';
    this.transporte = url ? nodemailer.createTransport(url) : null;
  }

  get configurado(): boolean {
    return this.transporte !== null;
  }

  async enviar(email: Email): Promise<void> {
    if (!this.transporte) throw new Error('SMTP não configurado');
    await this.transporte.sendMail({
      from: this.remetente,
      to: email.para,
      subject: email.assunto,
      html: email.html,
      text: email.texto,
    });
    // Só o destinatário vai pro log: o corpo tem nome e patrimônio de clientes
    this.logger.log(`E-mail enviado para ${email.para}`);
  }
}
