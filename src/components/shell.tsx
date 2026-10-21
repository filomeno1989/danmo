"use client";

/**
 * shell.tsx - Casca do portal: topbar + sidebar + area de conteudo.
 *
 * Novo desenho (mockups do Filomeno, Outubro 2026):
 * - Topbar: logo à esquerda, PÍLULA de data/hora ao vivo ao centro
 *   (hora de Maputo), e à direita o alternador de tema, a campainha de
 *   novidades reais do portal e o perfil com ponto verde de estado;
 * - Sidebar: em computador nasce ABERTA com os nomes à vista (com botão
 *   para recolher a ícones, guardado no navegador); item activo com
 *   azulejo de ícone na cor da marca; no fundo, a citação da Danmo;
 * - Telemóvel: sidebar escondida, abre em overlay com o hambúrguer.
 *
 * Tema unificado: tudo muda junto no claro/escuro. Acento do tema claro
 * é o azul da marca; no escuro é o verde (como nos mockups).
 *
 * A lista de módulos chega COMPLETA do SERVIDOR, junto com as páginas
 * autorizadas na matriz por utilizador: o menu nunca esconde - mostra
 * bloqueado (círculo com a barra) o que a pessoa não pode usar, como nas
 * fases por migrar. O servidor decide sempre (as páginas e as APIs
 * verificam do lado de lá).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import {
  Home,
  Settings2,
  Truck,
  Briefcase,
  Package,
  AlertTriangle,
  Wrench,
  KeyRound,
  ClipboardList,
  Settings,
  ChevronRight,
  ChevronDown,
  Plus,
  Minus,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  Bell,
  CalendarDays,
  ImageIcon,
  PanelLeftClose,
  PanelLeftOpen,
  CircleCheck,
  CircleSlash,
  UserRoundPlus,
  UserRound,
  type LucideIcon
} from "lucide-react";
import { useTheme } from "next-themes";
import { trocarTemaInstantaneo } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import type { Modulo } from "@/lib/permissoes";
import type { Utilizador } from "@/lib/uso-comum";
import { NIVEL_LABEL } from "@/lib/uso-comum";

const ICONES: Record<string, LucideIcon> = {
  Home,
  Settings2,
  Truck,
  Briefcase,
  Package,
  AlertTriangle,
  Wrench,
  KeyRound,
  ClipboardList,
  Settings
};

type Novidade = {
  id: string;
  icone: LucideIcon;
  cor: string;
  fundo: string;
  titulo: string;
  texto: string;
};

type Props = {
  utilizador: Utilizador;
  /** Menu completo (o servidor já decide; aqui só se marca bloqueado). */
  modulos: Modulo[];
  /** Ids das páginas autorizadas na matriz por utilizador. */
  paginas: string[];
  children: React.ReactNode;
};

/** Partes da data/hora na hora certa: sempre África/Maputo (UTC+2). */
function partesMaputo(agora: Date) {
  const fmt = new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Africa/Maputo",
    weekday: "long",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const partes = fmt.formatToParts(agora);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value || "";
  const capitalizar = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const mesNum = Number(p("month"));
  return {
    diaSemana: capitalizar(p("weekday")),
    dia: p("day"),
    mes: MESES[(mesNum || 1) - 1] || "",
    hora: p("hour"),
    minuto: p("minute")
  };
}

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro"
];

export function Shell({ utilizador, modulos, paginas, children }: Props) {
  const router = useRouter();
  const caminho = usePathname();
  const { resolvedTheme, setTheme } = useTheme();

  const [mobileAberta, setMobileAberta] = useState(false);
  const [recolhida, setRecolhida] = useState(false); // só faz sentido em desktop
  const [moduloAberto, setModuloAberto] = useState<string | null>(null);
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null);
  const [agora, setAgora] = useState<Date | null>(null);
  const [novidadesVistas, setNovidadesVistas] = useState(true);

  // Relógio: primeiro tick em seguida, depois cada 10 segundos (a pílula
  // mostra hora e minuto; um segundo a segundo seria desperdício)
  useEffect(() => {
    const primeiro = setTimeout(() => setAgora(new Date()), 0);
    const t = setInterval(() => setAgora(new Date()), 10000);
    return () => {
      clearTimeout(primeiro);
      clearInterval(t);
    };
  }, []);

  // Preferência do menu guardada no navegador (só desktop). Lida num
  // segundo tempo (depois do primeiro render) para não dessincronizar
  // o React no hidratar.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (localStorage.getItem("danmo-menu") === "fechado") setRecolhida(true);
        setNovidadesVistas(localStorage.getItem("danmo-novidades") === "vistas");
      } catch {
        // sem localStorage (navegação privada): usa os valores por defeito
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Ao mudar de página, fecha o menu do telemóvel (padrão "ajustar estado
  // durante o render": nada de efeitos a desnortear o React)
  const [ultimoCaminho, setUltimoCaminho] = useState(caminho);
  if (caminho !== ultimoCaminho) {
    setUltimoCaminho(caminho);
    setMobileAberta(false);
  }

  function alternarMenu() {
    setRecolhida((v) => {
      const novo = !v;
      try {
        localStorage.setItem("danmo-menu", novo ? "fechado" : "aberto");
      } catch {
        // sem localStorage: só muda para esta visita
      }
      return novo;
    });
  }

  function clicarModulo(m: Modulo) {
    const temDetalhe = Boolean(m.sub?.length || m.grupos?.length);
    if (m.fase > 0 || m.dev || !temDetalhe) return; // cartaz ou link directo
    if (recolhida) {
      // Recolhida: abre o menu e o submenu de uma vez
      setRecolhida(false);
      setModuloAberto(m.id);
      return;
    }
    if (moduloAberto === m.id) {
      setModuloAberto(null);
      return;
    }
    setModuloAberto(m.id);
    setGrupoAberto(null);
  }

  async function sair() {
    try {
      await fetch("/api/auth/sair", { method: "POST" });
    } catch {
      // mesmo sem ligação, voltamos ao login
    }
    router.replace("/login?motivo=sem_sessao");
    router.refresh();
  }

  const iconeTema = (
    <>
      <Sun className="hidden dark:block" aria-hidden />
      <Moon className="dark:hidden" aria-hidden />
    </>
  );
  const inicial = (utilizador.nome || "?").charAt(0).toUpperCase();
  const nivelTexto = NIVEL_LABEL[utilizador.nivel] || utilizador.nivel || "";
  const eAdmin = utilizador.nivel === "admin";

  // Novidades REAIS do portal (nada de dados inventados): o que mudou
  // nesta fundação, o que a administração pode fazer e o auto-registo.
  const novidades: Novidade[] = [
    {
      id: "fase1",
      icone: CircleCheck,
      cor: "text-sucesso",
      fundo: "bg-sucesso-bg",
      titulo: "Fase 1 concluída",
      texto: "Fundação do portal no ar: login no servidor, menu por permissões e tema unificado."
    },
    ...(eAdmin
      ? [
          {
            id: "personalizar",
            icone: ImageIcon,
            cor: "text-primario",
            fundo: "bg-sucesso-bg",
            titulo: "Personalizar portal",
            texto: "Carrega fotos da empresa para o fundo do login e do painel, em Definições."
          }
        ]
      : []),
    {
      id: "registo",
      icone: UserRoundPlus,
      cor: "text-aviso",
      fundo: "bg-aviso-bg",
      titulo: "Auto-registo activo",
      texto: "Os colegas criam o acesso com o código de colaborador; depois a administração dá os restantes acessos."
    }
  ];
  const novidadesCount = novidadesVistas ? 0 : novidades.length;

  function verNovidades(aberto: boolean) {
    if (!aberto) return;
    setNovidadesVistas(true);
    try {
      localStorage.setItem("danmo-novidades", "vistas");
    } catch {
      // sem localStorage: só deixa de mostrar nesta visita
    }
  }

  const partes = agora ? partesMaputo(agora) : null;
  const dataTexto = partes && `${partes.diaSemana}, ${partes.dia} de ${partes.mes}`;
  const horaTexto = partes && `${partes.hora}:${partes.minuto}`;

  const comRotulos = mobileAberta || !recolhida;

  return (
    <div className="min-h-screen">
      {/* ============ Topbar ============ */}
      <header className="fixed inset-x-0 top-0 z-50 flex h-[60px] items-center justify-between gap-2 border-b border-sidebar-border bg-topbar px-3 text-topbar-foreground shadow-sm sm:px-5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileAberta((v) => !v)}
            aria-label="Abrir menu"
            title="Abrir / fechar menu"
            className="size-10 shrink-0 text-topbar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </Button>
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <Image
              src="/logos/danmo-logo.png"
              alt="Logo Danmo Service System"
              width={64}
              height={38}
              className="h-[34px] w-auto"
              priority
            />
            <span className="min-w-0 truncate text-[0.98rem] font-bold whitespace-nowrap">
              Portal Danmo{" "}
              <span className="hidden font-medium text-topbar-foreground/60 sm:inline">
                Service System, Lda
              </span>
            </span>
          </Link>
        </div>

        {/* Pílula de data/hora ao vivo, ao centro (como no mockup) */}
        <div
          className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2.5 rounded-full border border-border bg-card/80 px-4 py-1.5 text-[0.8rem] text-muted-foreground shadow-sm lg:flex"
          suppressHydrationWarning
        >
          <CalendarDays className="size-4 text-primario" aria-hidden />
          <span>{dataTexto || "\u00a0"}</span>
          <span aria-hidden className="h-3.5 w-px bg-border" />
          <span className="font-semibold tabular-nums text-foreground">
            {horaTexto || "\u00a0"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => trocarTemaInstantaneo(resolvedTheme, setTheme)}
            aria-label="Alternar tema"
            title="Alternar modo claro / escuro"
            className="size-10 text-topbar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {iconeTema}
          </Button>

          {/* Campainha: novidades reais do portal */}
          <DropdownMenu onOpenChange={verNovidades}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Novidades do portal${novidadesCount ? ` (${novidadesCount})` : ""}`}
                title="Novidades do portal"
                className="relative size-10 text-topbar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <Bell className="size-5" aria-hidden />
                {novidadesCount > 0 && (
                  <span className="absolute top-1 right-1 flex size-4.5 items-center justify-center rounded-full bg-erro text-[0.6rem] font-bold text-white">
                    {novidadesCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Novidades do portal
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="space-y-1">
                {novidades.map((n) => (
                  <div key={n.id} className="flex items-start gap-2.5 rounded-lg px-2 py-2">
                    <span
                      className={
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg " +
                        n.fundo
                      }
                    >
                      <n.icone className={"size-4 " + n.cor} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[0.84rem] font-semibold">{n.titulo}</p>
                      <p className="text-[0.76rem] leading-relaxed text-muted-foreground">
                        {n.texto}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Perfil */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Menu do utilizador"
                title="Perfil do utilizador"
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-sidebar-accent"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ambar text-sm font-bold text-[#101b2d]">
                  {inicial}
                </span>
                <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
                  <span className="max-w-[160px] truncate text-[0.85rem] font-semibold">
                    {utilizador.nome}
                  </span>
                  <span className="flex items-center gap-1.5 text-[0.72rem] text-topbar-foreground/65">
                    <span aria-hidden className="size-1.5 rounded-full bg-sucesso" />
                    {nivelTexto}
                  </span>
                </span>
                <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Painel do utilizador
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-sm">
                <p className="font-semibold">{utilizador.nome}</p>
                <p className="mt-1 text-muted-foreground">
                  Código: <span className="font-medium">{utilizador.usuario}</span>
                </p>
                <p className="text-muted-foreground">
                  Cargo: <span className="font-medium">{utilizador.cargo || "-"}</span>
                </p>
                <p className="text-muted-foreground">
                  Nível: <span className="font-medium">{nivelTexto || "-"}</span>
                </p>
              </div>
              <DropdownMenuSeparator />
              {eAdmin && (
                <DropdownMenuItem asChild>
                  <Link href="/admin/personalizar" className="cursor-pointer">
                    <Settings aria-hidden />
                    Definições (Personalizar portal)
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link href="/perfil" className="cursor-pointer">
                  <UserRound aria-hidden />
                  Os meus dados
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={sair}
                variant="destructive"
                className="font-semibold"
              >
                <LogOut aria-hidden />
                Terminar Sessão
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ============ Overlay (mobile) ============ */}
      {mobileAberta && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileAberta(false)}
          aria-hidden
        />
      )}

      {/* ============ Sidebar ============ */}
      <nav
        aria-label="Menu principal"
        className={
          "fixed top-0 left-0 bottom-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 lg:top-[60px] lg:bottom-0 " +
          (mobileAberta
            ? "w-[264px] translate-x-0 shadow-2xl"
            : "w-[264px] -translate-x-full lg:translate-x-0 " +
              (recolhida ? "lg:w-[68px]" : "lg:w-[264px]"))
        }
      >
        {/* Cabeçalho do menu no telemóvel (com o botão para fechar) */}
        <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-sidebar-border px-3 lg:hidden">
          <span className="flex items-center gap-2.5 pl-2 text-[0.95rem] font-bold text-sidebar-foreground">
            <Image
              src="/logos/danmo-logo.png"
              alt=""
              width={56}
              height={34}
              className="h-[30px] w-auto"
            />
            Portal Danmo
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileAberta(false)}
            aria-label="Fechar menu"
            title="Fechar menu"
            className="size-10 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <X className="size-5" aria-hidden />
          </Button>
        </div>

        {/* Botão de recolher / abrir (só desktop) */}
        <div
          className={
            "hidden shrink-0 pt-3 lg:block " + (recolhida ? "px-2" : "px-3")
          }
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={alternarMenu}
            aria-label={recolhida ? "Abrir o menu" : "Recolher o menu"}
            title={recolhida ? "Abrir o menu" : "Recolher o menu"}
            className={
              "size-9 text-sidebar-secundario hover:bg-sidebar-accent hover:text-sidebar-accent-foreground " +
              (recolhida ? "mx-auto" : "ml-auto")
            }
          >
            {recolhida ? (
              <PanelLeftOpen className="size-4.5" aria-hidden />
            ) : (
              <PanelLeftClose className="size-4.5" aria-hidden />
            )}
          </Button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-2.5">
          {modulos.map((m) => {
            const Icone = ICONES[m.icone] || Home;
            const temDetalhe = Boolean(m.sub?.length || m.grupos?.length);
            const emCartaz = m.fase > 0 || m.dev;
            const activo = m.id === "inicio" && caminho === "/";

            /* Página Permissões: só a administração entra; os outros
               vê-la-ão bloqueada (é a cara da matriz por utilizador) */
            if (m.id === "permissoes" && !eAdmin) {
              return (
                <div
                  key={m.id}
                  title={comRotulos ? undefined : "Permissões (só administração)"}
                  className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sidebar-foreground/45"
                >
                  <Icone className="size-5 shrink-0" aria-hidden />
                  <span
                    className={
                      "min-w-0 flex-1 truncate text-[0.88rem] " +
                      (!comRotulos ? "lg:hidden" : "")
                    }
                  >
                    {m.label}
                  </span>
                  {comRotulos && (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.62rem] font-bold text-muted-foreground uppercase">
                      Admin
                    </span>
                  )}
                </div>
              );
            }

            /* Página Permissões (admin): link directo */
            if (m.id === "permissoes") {
              const permActiva = caminho.startsWith("/permissoes");
              return (
                <Link
                  key={m.id}
                  href="/permissoes"
                  title="Permissões e contas"
                  aria-current={permActiva ? "page" : undefined}
                  className={
                    "relative flex items-center gap-3 rounded-lg px-3 py-2 transition-colors " +
                    (!mobileAberta && recolhida ? "lg:justify-center lg:px-0 " : "") +
                    (permActiva
                      ? "bg-sidebar-activo"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")
                  }
                >
                  {permActiva ? (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primario text-white shadow-sm">
                      <Icone className="size-4.5" aria-hidden />
                    </span>
                  ) : (
                    <Icone className="size-5 shrink-0 text-sidebar-foreground/80" aria-hidden />
                  )}
                  <span
                    className={
                      "min-w-0 flex-1 truncate text-[0.88rem] " +
                      (permActiva ? "font-semibold text-sidebar-activo-texto" : "") +
                      " " +
                      (!comRotulos ? "lg:hidden" : "")
                    }
                  >
                    {m.label}
                  </span>
                </Link>
              );
            }

            /* Cartaz: módulo ainda por migrar ou em desenvolvimento */
            if (emCartaz) {
              return (
                <div
                  key={m.id}
                  title={
                    comRotulos
                      ? undefined
                      : m.dev
                        ? `${m.label} (em desenvolvimento)`
                        : `${m.label} (chega na Fase ${m.fase})`
                  }
                  className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sidebar-foreground/45"
                >
                  <Icone className="size-5 shrink-0" aria-hidden />
                  <span
                    className={
                      "min-w-0 flex-1 truncate text-[0.88rem] " +
                      (!comRotulos ? "lg:hidden" : "")
                    }
                  >
                    {m.label}
                  </span>
                  {comRotulos &&
                    (m.dev ? (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.62rem] font-bold text-muted-foreground uppercase">
                        Dev
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.62rem] font-bold text-muted-foreground">
                        Fase {m.fase}
                      </span>
                    ))}
                </div>
              );
            }

            /* Painel Principal (link directo) */
            if (!temDetalhe) {
              return (
                <Link
                  key={m.id}
                  href="/"
                  title={m.label}
                  aria-current={activo ? "page" : undefined}
                  className={
                    "relative flex items-center gap-3 rounded-lg px-3 py-2 transition-colors " +
                    (!mobileAberta && recolhida ? "lg:justify-center lg:px-0 " : "") +
                    (activo
                      ? "bg-sidebar-activo"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")
                  }
                >
                  {activo ? (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primario text-white shadow-sm">
                      <Icone className="size-4.5" aria-hidden />
                    </span>
                  ) : (
                    <Icone className="size-5 shrink-0 text-sidebar-foreground/80" aria-hidden />
                  )}
                  <span
                    className={
                      "min-w-0 flex-1 truncate text-[0.88rem] " +
                      (activo ? "font-semibold text-sidebar-activo-texto" : "") +
                      " " +
                      (!comRotulos ? "lg:hidden" : "")
                    }
                  >
                    {m.label}
                  </span>
                </Link>
              );
            }

            /* Módulo com páginas (entra quando houver módulo activo com sub) */
            const esteAberto = moduloAberto === m.id && comRotulos;
            const temGrupos = Boolean(m.grupos?.length);
            return (
              <div key={m.id}>
                <button
                  type="button"
                  onClick={() => clicarModulo(m)}
                  aria-expanded={esteAberto}
                  title={m.label}
                  className={
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors " +
                    (esteAberto
                      ? "bg-sidebar-activo text-sidebar-activo-texto"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")
                  }
                >
                  <Icone className="size-5 shrink-0" aria-hidden />
                  <span
                    className={
                      "min-w-0 flex-1 truncate text-left text-[0.88rem] " +
                      (!comRotulos ? "lg:hidden" : "")
                    }
                  >
                    {m.label}
                  </span>
                  {comRotulos && (
                    <ChevronDown
                      className={
                        "size-4 shrink-0 transition-transform " +
                        (esteAberto ? "rotate-180" : "")
                      }
                      aria-hidden
                    />
                  )}
                </button>

                {esteAberto && (
                  <div className="mt-1 mb-1 ml-4 space-y-0.5 border-l border-sidebar-border pl-2">
                    {temGrupos
                      ? m.grupos?.map((grupo) => {
                          const ga = grupoAberto === grupo.label;
                          return (
                            <div key={grupo.label}>
                              <button
                                type="button"
                                onClick={() => setGrupoAberto(ga ? null : grupo.label)}
                                aria-expanded={ga}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[0.8rem] text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                              >
                                <span className="min-w-0 flex-1 truncate">{grupo.label}</span>
                                <span className="shrink-0 text-sidebar-secundario">
                                  {ga ? (
                                    <Minus className="size-3.5" />
                                  ) : (
                                    <Plus className="size-3.5" />
                                  )}
                                </span>
                              </button>
                              {ga && (
                                <div className="mb-1 ml-3 space-y-0.5 border-l border-sidebar-border pl-2">
                                  {grupo.itens.map((item) => {
                                    /* Mesma regra das sub-páginas: item de
                                       grupo com página entra pela matriz; sem
                                       página (Em migração) só a administração.
                                       Bloqueado: círculo com a barra - o
                                       servidor recusa de qualquer forma. */
                                    const autorizadoItem = item.pagina
                                      ? paginas.includes(item.pagina)
                                      : eAdmin;
                                    if (!autorizadoItem) {
                                      return (
                                        <div
                                          key={item.label}
                                          title={`${item.label} (sem acesso)`}
                                          className="flex cursor-not-allowed items-center gap-2 rounded-lg px-2.5 py-2 text-[0.8rem] text-sidebar-foreground/40"
                                        >
                                          <CircleSlash
                                            className="size-3 shrink-0 opacity-60"
                                            aria-hidden
                                          />
                                          <span className="truncate">{item.label}</span>
                                        </div>
                                      );
                                    }
                                    return (
                                      <Link
                                        key={item.label}
                                        href={item.href}
                                        className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[0.8rem] text-sidebar-secundario transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                      >
                                        <ChevronRight
                                          className="size-3 shrink-0 opacity-50"
                                          aria-hidden
                                        />
                                        <span className="truncate">{item.label}</span>
                                      </Link>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                      : m.sub?.map((item) => {
                          const autorizada =
                            !item.pagina || paginas.includes(item.pagina);
                          if (!autorizada) {
                            /* Página sem permissão: mostra bloqueada
                               (círculo com a barra) - o servidor recusa
                               de qualquer forma se abrirem por URL */
                            return (
                              <div
                                key={item.label}
                                title={`${item.label} (sem acesso)`}
                                className="flex cursor-not-allowed items-center gap-2 rounded-lg px-2.5 py-2 text-[0.8rem] text-sidebar-foreground/40"
                              >
                                <CircleSlash
                                  className="size-3 shrink-0 opacity-60"
                                  aria-hidden
                                />
                                <span className="truncate">{item.label}</span>
                              </div>
                            );
                          }
                          return (
                            <Link
                              key={item.label}
                              href={item.href}
                              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[0.8rem] text-sidebar-secundario transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            >
                              <ChevronRight
                                className="size-3 shrink-0 opacity-50"
                                aria-hidden
                              />
                              <span className="truncate">{item.label}</span>
                            </Link>
                          );
                        })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Definições: só administração (leva à personalização do portal) */}
          {eAdmin && (
            <Link
              href="/admin/personalizar"
              title="Definições: personalizar o portal"
              className={
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground " +
                (!mobileAberta && recolhida ? "lg:justify-center lg:px-0" : "")
              }
            >
              <Settings className="size-5 shrink-0 text-sidebar-foreground/80" aria-hidden />
              <span
                className={
                  "min-w-0 flex-1 truncate text-[0.88rem] " +
                  (!comRotulos ? "lg:hidden" : "")
                }
              >
                Definições
              </span>
            </Link>
          )}
        </div>

        {/* Citação da marca no fundo da sidebar (compacta: sem desenho,
            para o menu respirar) */}
        <div className={"shrink-0 border-t border-sidebar-border " + (comRotulos ? "px-4 py-3" : "hidden lg:block lg:py-3")}>
          {comRotulos ? (
            <>
              <p className="text-[0.72rem] leading-relaxed text-sidebar-secundario italic">
                "Juntos construímos um sistema mais forte."
              </p>
              <p className="mt-1 text-[0.66rem] font-bold tracking-wide text-sidebar-foreground/70">
                Danmo Service System, Lda
              </p>
            </>
          ) : (
            <p className="text-center text-[0.6rem] font-semibold text-sidebar-secundario">
              v3.0
            </p>
          )}
        </div>
      </nav>

      {/* ============ Conteúdo ============ */}
      <main
        className={
          "min-h-screen pt-[60px] transition-[padding] duration-200 " +
          (recolhida ? "lg:pl-[68px]" : "lg:pl-[264px]")
        }
      >
        <div className="mx-auto w-full max-w-[1240px] p-4 pb-10 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
