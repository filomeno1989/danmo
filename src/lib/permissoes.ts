/**
 * permissoes.ts - Mapa de módulos do portal (espelha o shared/nav.js do hub).
 *
 * Cada entrada tem:
 * - id: igual ao usado na matriz de permissões da base de dados;
 * - label: nome visível no menu;
 * - icone: nome do ícone (lucide) usado na sidebar;
 * - fase: fase da migração em que o módulo chega (0 = já disponível);
 * - sub: páginas dentro do módulo (também espelham o hub);
 * - dev: cartaz "Em desenvolvimento" (como no hub actual).
 *
 * As permissões granulares por utilizador (o teu pedido: usuário x só mexe
 * em Ordens de Serviço, etc.) entram na Fase 7 com a gestão visual. A
 * fundação já está preparada: o servidor recebe a matriz da base de dados
 * e filtra este mapa antes de o menu chegar ao navegador.
 */

export type ModuloSub = {
  label: string;
  href: string;
  novaAba?: boolean;
};

export type ModuloGrupo = {
  label: string;
  itens: ModuloSub[];
};

export type Modulo = {
  id: string;
  label: string;
  icone: string;
  fase: number;
  dev?: boolean;
  sub?: ModuloSub[];
  grupos?: ModuloGrupo[];
};

export const MODULOS: Modulo[] = [
  {
    id: "inicio",
    label: "Início",
    icone: "Home",
    fase: 0
  },
  {
    id: "oficina",
    label: "Oficina & Manutenção",
    icone: "Settings2",
    fase: 0,
    sub: [
      { label: "Visão Geral", href: "/oficina" },
      { label: "Ordens de Serviço", href: "/oficina/ordens" },
      { label: "Checklist", href: "/oficina/checklist" },
      { label: "Equipamentos", href: "/oficina/equipamentos" },
      { label: "Faturação CdM", href: "/oficina/faturacao" },
      { label: "Relatórios", href: "/oficina/relatorios" },
      { label: "Configurações", href: "/oficina/config" }
    ]
  },
  {
    id: "disponibilidade",
    label: "Disponibilidade Equip.",
    icone: "Truck",
    fase: 0,
    sub: [
      { label: "Painel", href: "/disponibilidade" },
      { label: "Grelha Diária", href: "/disponibilidade/grelha" },
      { label: "Horómetro", href: "/disponibilidade/horometro" },
      { label: "Resumo Semanal", href: "/disponibilidade/semana" },
      { label: "Configurações", href: "/disponibilidade/config" }
    ]
  },
  {
    id: "admin",
    label: "Admin. Oficinal",
    icone: "Briefcase",
    fase: 6,
    grupos: [
      {
        label: "RH & Quadro de Pessoal",
        itens: [{ label: "RH & Quadro de Pessoal", href: "/em-migracao?mod=rh" }]
      },
      {
        label: "Avaliação de Desempenho",
        itens: [
          { label: "Painel (Campanhas)", href: "/em-migracao?mod=avaliacao" },
          { label: "Responsáveis por Área", href: "/em-migracao?mod=avaliacao" },
          { label: "Directores", href: "/em-migracao?mod=avaliacao" }
        ]
      },
      {
        label: "Pedidos de Aquisição",
        itens: [
          { label: "Painel", href: "/em-migracao?mod=aquisicao" },
          { label: "Novo Pedido", href: "/em-migracao?mod=aquisicao" },
          { label: "Histórico", href: "/em-migracao?mod=aquisicao" },
          { label: "Configurações", href: "/em-migracao?mod=aquisicao" }
        ]
      },
      {
        label: "Plano de Férias",
        itens: [
          { label: "Painel", href: "/em-migracao?mod=ferias" },
          { label: "Plano Anual", href: "/em-migracao?mod=ferias" },
          { label: "Calendário Visual", href: "/em-migracao?mod=ferias" },
          { label: "O Meu Plano (consulta)", href: "/em-migracao?mod=ferias" }
        ]
      },
      {
        label: "Faturação (Cotações e Faturas)",
        itens: [
          { label: "Painel", href: "/em-migracao?mod=faturacao" },
          { label: "Novo Documento", href: "/em-migracao?mod=faturacao" },
          { label: "Clientes", href: "/em-migracao?mod=faturacao" },
          { label: "Técnicos", href: "/em-migracao?mod=faturacao" },
          { label: "Tarifas", href: "/em-migracao?mod=faturacao" },
          { label: "Relatórios", href: "/em-migracao?mod=faturacao" }
        ]
      }
    ]
  },
  {
    id: "stock",
    label: "Gestão de Stock",
    icone: "Package",
    fase: 0,
    sub: [
      { label: "Painel", href: "/stock" },
      { label: "Entradas", href: "/stock/entradas" },
      { label: "Saídas", href: "/stock/saidas" },
      { label: "Materiais", href: "/stock/materiais" },
      { label: "Relatórios", href: "/stock/relatorios" },
      { label: "Configurações", href: "/stock/config" }
    ]
  },
  {
    id: "hst",
    label: "Portal HST",
    icone: "AlertTriangle",
    fase: 5,
    sub: [
      { label: "Painel", href: "/em-migracao?mod=hst" },
      { label: "Acidentes", href: "/em-migracao?mod=hst" },
      { label: "Areas de Risco", href: "/em-migracao?mod=hst" },
      { label: "EPIs", href: "/em-migracao?mod=hst" },
      { label: "Tensao Arterial", href: "/em-migracao?mod=hst" },
      { label: "Relatorios", href: "/em-migracao?mod=hst" },
      { label: "Configuracao", href: "/em-migracao?mod=hst" }
    ]
  },
  {
    id: "ferramentaria",
    label: "Ferramentaria",
    icone: "Wrench",
    fase: 5,
    sub: [
      { label: "Painel", href: "/em-migracao?mod=ferramentaria" },
      { label: "Inventário", href: "/em-migracao?mod=ferramentaria" },
      { label: "Empréstimos", href: "/em-migracao?mod=ferramentaria" },
      { label: "Devoluções", href: "/em-migracao?mod=ferramentaria" },
      { label: "Danos", href: "/em-migracao?mod=ferramentaria" },
      { label: "Ferramenteiros", href: "/em-migracao?mod=ferramentaria" },
      { label: "Relatórios", href: "/em-migracao?mod=ferramentaria" },
      { label: "Configurações", href: "/em-migracao?mod=ferramentaria" }
    ]
  },
  {
    id: "permissoes",
    label: "Permissões",
    icone: "KeyRound",
    fase: 7
  },
  {
    id: "gestao",
    label: "Gestão & Registos",
    icone: "ClipboardList",
    fase: 0,
    dev: true
  }
];

/** Módulos com sub/grupos: para validar se um link pertence ao módulo. */
export function moduloPorId(id: string): Modulo | undefined {
  return MODULOS.find((m) => m.id === id);
}
