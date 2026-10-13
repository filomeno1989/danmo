/**
 * rate-limit.ts - Limite de tentativas de login (do lado do servidor).
 *
 * Bloqueio progressivo: 5 tentativas falhadas com o mesmo código de
 * utilizador e o acesso fica suspenso 15 minutos. Isso trava tentativas
 * de força-bruta mesmo antes de chegarem à base de dados.
 *
 * Nota honesta: em serverless (Vercel) a memória de cada instância é
 * própria e pode ser reciclada, por isso isto é uma barreira de primeira
 * linha (best-effort). A barreira definitiva continua a ser a comparação
 * bcrypt dentro da função "autenticar" no Supabase. Na Fase 7 podemos
 * registar as tentativas numa tabela própria, se quiseres.
 */

const MAX_TENTATIVAS = 5;
const BLOQUEIO_MS = 15 * 60 * 1000;

type Registo = { falhas: number; bloqueadoAte: number };

const memoria = new Map<string, Registo>();

/** Limpa registos antigos de vez em quando (evitar crescimento infinito). */
function limparAntigos() {
  if (memoria.size < 5000) return;
  const agora = Date.now();
  for (const [chave, reg] of memoria) {
    if (reg.bloqueadoAte < agora) memoria.delete(chave);
  }
}

function chave(codigo: string): string {
  return String(codigo || "").trim().toUpperCase();
}

/** Diz se o código está bloqueado e quanto falta (ms). */
export function estaBloqueado(codigo: string): { bloqueado: boolean; esperaMs: number } {
  limparAntigos();
  const reg = memoria.get(chave(codigo));
  if (!reg) return { bloqueado: false, esperaMs: 0 };
  const falta = reg.bloqueadoAte - Date.now();
  if (falta > 0) return { bloqueado: true, esperaMs: falta };
  return { bloqueado: false, esperaMs: 0 };
}

/** Regista uma tentativa falhada. Devolve true se ficou bloqueado agora. */
export function registarFalha(codigo: string): boolean {
  const c = chave(codigo);
  const reg = memoria.get(c) || { falhas: 0, bloqueadoAte: 0 };
  reg.falhas += 1;
  if (reg.falhas >= MAX_TENTATIVAS) {
    reg.bloqueadoAte = Date.now() + BLOQUEIO_MS;
    reg.falhas = 0;
    memoria.set(c, reg);
    return true;
  }
  memoria.set(c, reg);
  return false;
}

/** Limpa as falhas do código (após entrar com sucesso). */
export function limparFalhas(codigo: string) {
  memoria.delete(chave(codigo));
}

/** Minutos que faltam para desbloquear (para mostrar na mensagem). */
export function minutosDeEspera(esperaMs: number): number {
  return Math.max(1, Math.ceil(esperaMs / 60000));
}
