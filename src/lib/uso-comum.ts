/**
 * uso-comum.ts - Tipos e constantes partilhados entre SERVIDOR e NAVEGADOR.
 *
 * Este ficheiro NÃO pode importar nada do servidor (next/headers,
 * supabase.ts): é usado também por componentes client. O auth.ts do
 * servidor importa daqui e re-exporta, para um só sítio de verdade.
 */

export const COOKIE_SESSAO = "dss_token";

export type Utilizador = {
  id: number | string;
  usuario: string;
  nome: string;
  cargo: string;
  nivel: string;
  precisa_trocar: boolean;
};

export type LinhaPermissao = {
  nivel: string;
  modulo: string;
  acao: string;
  permitido: boolean;
};

/** Rótulos de nível usados na topbar/perfil (iguais ao hub). */
export const NIVEL_LABEL: Record<string, string> = {
  admin: "Admin",
  gestor: "Gestor",
  operador: "Operador",
  consulta: "Consulta",
  // Contas criadas pelo auto-registo: ficam à espera que a administração
  // lhes dê os acessos. Enquanto isso, só veem o Painel Principal.
  pendente: "Acesso por aprovar"
};

/** Uma foto do slideshow de fundo do login. */
export type FundoLogin = {
  posicao: number;
  nome: string;
  foto: string; // data URL (base64) da imagem já comprimida
};
