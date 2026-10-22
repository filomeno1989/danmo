/**
 * permissoes.ts - Mapa de módulos e PÁGINAS do portal (espelha o hub).
 *
 * Cada entrada tem:
 * - id: igual ao usado na matriz de permissões da base de dados;
 * - label: nome visível no menu;
 * - icone: nome do ícone (lucide) usado na sidebar;
 * - fase: fase da migração em que o módulo chega (0 = já disponível);
 * - sub: páginas dentro do módulo, cada uma com o SEU id de página
 *   ("modulo.pagina") para a matriz POR UTILIZADOR da Fase 7 R1;
 * - dev: cartaz "Em desenvolvimento" (como no hub actual).
 *
 * A partir da Fase 7 R1 a matriz é POR UTILIZADOR x PÁGINA x (ver/mexer/
 * apagar), atribuída à mão pelo Filomeno na página Permissões. O menu
 * nunca esconde: quem não tem permissão vê o item bloqueado (círculo com
 * a barra), como nas fases por migrar. O servidor decide sempre.
 */

export type ModuloSub = {
  label: string;
  href: string;
  /** Id da página na matriz de permissões (ex.: "stock.entradas"). */
  pagina?: string;
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
      { label: "Visão Geral", href: "/oficina", pagina: "oficina" },
      { label: "Ordens de Serviço", href: "/oficina/ordens", pagina: "oficina.ordens" },
      { label: "Checklist", href: "/oficina/checklist", pagina: "oficina.checklist" },
      { label: "Equipamentos", href: "/oficina/equipamentos", pagina: "oficina.equipamentos" },
      { label: "Faturação CdM", href: "/oficina/faturacao", pagina: "oficina.faturacao" },
      { label: "Relatórios", href: "/oficina/relatorios", pagina: "oficina.relatorios" },
      { label: "Configurações", href: "/oficina/config", pagina: "oficina.config" }
    ]
  },
  {
    id: "disponibilidade",
    label: "Disponibilidade Equip.",
    icone: "Truck",
    fase: 0,
    sub: [
      { label: "Painel", href: "/disponibilidade", pagina: "disponibilidade" },
      { label: "Grelha Diária", href: "/disponibilidade/grelha", pagina: "disponibilidade.grelha" },
      { label: "Horómetro", href: "/disponibilidade/horometro", pagina: "disponibilidade.horometro" },
      { label: "Resumo Semanal", href: "/disponibilidade/semana", pagina: "disponibilidade.semana" },
      { label: "Configurações", href: "/disponibilidade/config", pagina: "disponibilidade.config" }
    ]
  },
  {
    id: "admin",
    label: "Admin. Oficinal",
    icone: "Briefcase",
    // Fase 6 começou a entrar no ar: a FATURAÇÃO (Cotações e Faturas) é
    // o primeiro módulo real deste grupo. Os restantes grupos seguem
    // "Em migração" (bloqueados para todos menos a administração).
    fase: 0,
    grupos: [
      {
        label: "Recursos Humanos",
        itens: [
          { label: "Quadro de Pessoal", href: "/rh/quadro", pagina: "rh.quadro" },
          { label: "Aniversários & Cartazes", href: "/rh/aniversarios", pagina: "rh.aniversarios" },
          { label: "Documentos", href: "/rh/documentos", pagina: "rh.documentos" }
        ]
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
          { label: "Painel", href: "/faturacao", pagina: "faturacao" },
          { label: "Novo Documento", href: "/faturacao/editor", pagina: "faturacao.editor" },
          { label: "Clientes", href: "/faturacao/clientes", pagina: "faturacao.clientes" },
          { label: "Técnicos", href: "/faturacao/tecnicos", pagina: "faturacao.tecnicos" },
          { label: "Tarifas", href: "/faturacao/tarifas", pagina: "faturacao.tarifas" },
          { label: "Relatórios", href: "/faturacao/relatorios", pagina: "faturacao.relatorios" }
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
      { label: "Painel", href: "/stock", pagina: "stock" },
      { label: "Entradas", href: "/stock/entradas", pagina: "stock.entradas" },
      { label: "Saídas", href: "/stock/saidas", pagina: "stock.saidas" },
      { label: "Materiais", href: "/stock/materiais", pagina: "stock.materiais" },
      { label: "Relatórios", href: "/stock/relatorios", pagina: "stock.relatorios" },
      { label: "Configurações", href: "/stock/config", pagina: "stock.config" }
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
    // No ar (R1): a página em si é só para a administração; os outros
    // vê-la-ão bloqueada no menu, como o resto da estrutura.
    fase: 0
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

/**
 * As PÁGINAS atribuíveis na matriz (Fase 7 R1): as páginas reais dos
 * módulos já no ar (de "sub" e dos GRUPOS, como a Faturação dentro de
 * Admin. Oficinal). Início e o perfil próprio ("Os meus dados") são
 * garantidos a todos e não entram na matriz; a página Permissões é só
 * da administração. As páginas "Em migração" (fase > 0) ficam bloqueadas
 * para todos menos o admin, como sempre. Páginas novas entram SEM linha
 * na matriz: ninguém as vê até o Filomeno destravar à mão.
 */
export const PAGINAS: { pagina: string; label: string; modulo: string; href: string }[] = [
  ...MODULOS.filter((m) => m.fase === 0 && m.sub?.length).flatMap((m) =>
    (m.sub || [])
      .filter((s) => s.pagina)
      .map((s) => ({ pagina: s.pagina as string, label: s.label, modulo: m.id, href: s.href }))
  ),
  ...MODULOS.filter((m) => m.fase === 0 && m.grupos?.length).flatMap((m) =>
    (m.grupos || []).flatMap((g) =>
      g.itens
        .filter((i) => i.pagina)
        .map((i) => ({
          pagina: i.pagina as string,
          label: i.label,
          modulo: m.id,
          href: i.href
        }))
    )
  )
];

/** Label bonito de uma página na matriz (ex.: "Entradas (Gestão de Stock)"). */
export function labelPagina(pagina: string): string {
  if (pagina === "permissoes") return "Permissões & Contas";
  if (pagina === "perfil") return "Os meus dados";
  const p = PAGINAS.find((x) => x.pagina === pagina);
  if (!p) return pagina;
  // Faturação: "Painel" sozinho não diz nada na matriz; prefixa o módulo.
  // Recursos Humanos: os 3 itens partilham o mesmo módulo na matriz.
  const prefixo = pagina.startsWith("faturacao")
    ? "Faturação - "
    : pagina.startsWith("rh.")
      ? "RH - "
      : "";
  const mod = moduloPorId(p.modulo);
  return `${prefixo}${p.label} (${mod?.label || p.modulo})`;
}
