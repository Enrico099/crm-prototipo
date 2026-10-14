import { CifraMfa, gerarCodigoRecuperacao, pareceCodigoRecuperacao } from './cifra';
import { base32Decode, base32Encode, gerarSegredo, hotp, uriOtpauth, verificarTotp } from './totp';
import { senhaNovaSchema } from '../politica-senha';

// Segredo dos vetores de teste das RFCs: "12345678901234567890" em ASCII
const SEGREDO_RFC = Buffer.from('12345678901234567890');
const SEGREDO_RFC_B32 = base32Encode(SEGREDO_RFC);

describe('TOTP', () => {
  it('HOTP bate com os vetores da RFC 4226 (apêndice D)', () => {
    const esperados = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    esperados.forEach((codigo, contador) => expect(hotp(SEGREDO_RFC, contador)).toBe(codigo));
  });

  it.each([
    // RFC 6238 apêndice B (SHA-1); os 6 dígitos são o final dos 8 da RFC
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('TOTP em T=%i casa com a RFC 6238', (t, codigo) => {
    const passo = verificarTotp(SEGREDO_RFC_B32, codigo, t * 1000, 0);
    expect(passo).toBe(Math.floor(t / 30));
  });

  it('aceita ±1 passo (relógio do celular adiantado ou atrasado) e recusa ±2', () => {
    const agora = 1_700_000_000_000;
    const passo = Math.floor(agora / 30_000);
    const codigoDoPasso = (p: number) => hotp(SEGREDO_RFC, p);
    expect(verificarTotp(SEGREDO_RFC_B32, codigoDoPasso(passo - 1), agora)).toBe(passo - 1);
    expect(verificarTotp(SEGREDO_RFC_B32, codigoDoPasso(passo + 1), agora)).toBe(passo + 1);
    expect(verificarTotp(SEGREDO_RFC_B32, codigoDoPasso(passo + 2), agora)).toBeNull();
    expect(verificarTotp(SEGREDO_RFC_B32, codigoDoPasso(passo - 2), agora)).toBeNull();
  });

  it('recusa formato errado sem lançar', () => {
    for (const codigo of ['', '12345', '1234567', 'abcdef', '12 345']) {
      expect(verificarTotp(SEGREDO_RFC_B32, codigo)).toBeNull();
    }
  });

  it('base32 ida e volta, e o segredo gerado tem 160 bits', () => {
    const segredo = gerarSegredo();
    expect(segredo).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(segredo)).toHaveLength(20);
    expect(base32Decode(base32Encode(SEGREDO_RFC))).toEqual(SEGREDO_RFC);
  });

  it('URI otpauth tem emissor, conta e parâmetros padrão', () => {
    const uri = uriOtpauth('JBSWY3DPEHPK3PXP', 'joao@ce.com');
    expect(uri).toMatch(/^otpauth:\/\/totp\/Capital%20Elite%3Ajoao%40ce\.com\?/);
    const params = new URL(uri).searchParams;
    expect(params.get('secret')).toBe('JBSWY3DPEHPK3PXP');
    expect(params.get('issuer')).toBe('Capital Elite');
    expect(params.get('digits')).toBe('6');
    expect(params.get('period')).toBe('30');
  });
});

describe('CifraMfa', () => {
  const cifra = new CifraMfa('chave-de-teste-0123456789abcdef0123');

  it('cifra e decifra; o mesmo texto gera cifrados diferentes (IV aleatório)', () => {
    const a = cifra.cifrar('JBSWY3DPEHPK3PXP');
    const b = cifra.cifrar('JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(a).not.toContain('JBSWY3DPEHPK3PXP');
    expect(cifra.decifrar(a)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('recusa cifrado adulterado ou de outra chave', () => {
    const c = cifra.cifrar('segredo');
    const partes = c.split('.');
    partes[3] = Buffer.from('outra-coisa').toString('base64url');
    expect(() => cifra.decifrar(partes.join('.'))).toThrow();
    expect(() => new CifraMfa('outra-chave-0123456789abcdef0123456').decifrar(c)).toThrow();
  });

  it('hash do código de recuperação ignora maiúsculas, espaços e hífen', () => {
    expect(cifra.hashCodigo('abcde-fghjk')).toBe(cifra.hashCodigo(' ABCDE FGHJK '));
    expect(cifra.hashCodigo('abcde-fghjk')).not.toBe(cifra.hashCodigo('abcde-fghjm'));
  });

  it('códigos de recuperação: formato legível e sem colisão em uma leva', () => {
    const codigos = Array.from({ length: 200 }, gerarCodigoRecuperacao);
    for (const c of codigos) {
      expect(c).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
      expect(c).not.toMatch(/[01ilo]/);
      expect(pareceCodigoRecuperacao(c)).toBe(true);
    }
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(pareceCodigoRecuperacao('123456')).toBe(false);
  });
});

describe('política de senha', () => {
  it.each([
    ['curta1', false],
    ['somenteletrasmesmo', false],
    ['123456789012', false],
    ['SenhaForte2026', true],
    ['a1'.repeat(37), false], // 74 bytes: passa do limite do bcrypt
  ])('%s → %s', (senha, valida) => {
    expect(senhaNovaSchema.safeParse(senha).success).toBe(valida);
  });
});
