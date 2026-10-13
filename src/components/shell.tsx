"use client";

/**
 * shell.tsx - Casca do portal: topbar + sidebar + area de conteudo.
 *
 * Tema unificado: topbar e sidebar acompanham o modo claro/escuro como
 * todo o resto (nada de ambiente dividido). A identidade da marca vive
 * nos acentos: item activo em ambar, logo e detalhes.
 *
 * Comportamento igual ao do hub, que os colegas já conhecem:
 * - Desktop: sidebar compacta (só ícones); ao clicar num módulo com
 *   páginas, expande e abre o submenu; clicar fora recolhe;
 * - Telemóvel e tablet: sidebar escondida, abre em overlay com o
 *   hambúrguer da topbar;
 * - Topbar com data/hora ao vivo, alternador de tema e perfil do
 *   utilizador (com Terminar Sessão e, para administração, a
 *   Personalização do portal).
 *
 * A lista de módulos chega pronta do SERVIDOR (já filtrada pelas
 * permissões). Quem não tem permissão nem vê a opção no menu.
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
  ChevronRight,
  ChevronDown,
  Plus,
  Minus,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  ImageIcon,
  type LucideIcon
} from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
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
  ClipboardList
};

const DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado"
];
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

type Props = {
  utilizador: Utilizador;
  modulos: Modulo[];
  children: React.ReactNode;
};

export function Shell({ utilizador, modulos, children }: Props) {
  const router = useRouter();
  const caminho = usePathname();
  const { resolvedTheme, setTheme } = useTheme();

  const [mobileAberta, setMobileAberta] = useState(false);
  const [expandida, setExpandida] = useState(false);
  const [moduloAberto, setModuloAberto] = useState<string | null>(null);
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null);
  const [agora, setAgora] = useState<Date | null>(null);

  // Relógio ao vivo: primeiro tick em seguida, depois cada segundo
  useEffect(() => {
    const primeiro = setTimeout(() => setAgora(new Date()), 0);
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => {
      clearTimeout(primeiro);
      clearInterval(t);
    };
  }, []);

  // Ao mudar de página, fecha o menu do telemóvel (padrão "ajustar estado
  // durante o render": nada de efeitos a desnortear o React)
  const [ultimoCaminho, setUltimoCaminho] = useState(caminho);
  if (caminho !== ultimoCaminho) {
    setUltimoCaminho(caminho);
    setMobileAberta(false);
  }

  function clicarModulo(m: Modulo) {
    const temDetalhe = Boolean(m.sub?.length || m.grupos?.length);
    if (m.fase > 0 || m.dev || !temDetalhe) return; // cartaz ou link directo
    if (expandida && moduloAberto === m.id) {
      setExpandida(false);
      setModuloAberto(null);
      return;
    }
    setExpandida(true);
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

  const dataTexto =
    agora &&
    `${DIAS_SEMANA[agora.getDay()]}, ${agora.getDate()} de ${MESES[agora.getMonth()]}`;
  const horaTexto =
    agora &&
    [agora.getHours(), agora.getMinutes()]
      .map((n) => String(n).padStart(2, "0"))
      .join(":");

  return (
    <div className="min-h-screen">
      {/* ============ Topbar ============ */}
      <header className="fixed inset-x-0 top-0 z-50 flex h-[60px] items-center justify-between gap-2 border-b border-sidebar-border bg-topbar px-3 text-topbar-foreground shadow-sm sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
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
              width={36}
              height={36}
              className="size-9 object-contain"
              priority
            />
            <span className="min-w-0 truncate text-[0.95rem] font-bold whitespace-nowrap">
              Portal Danmo{" "}
              <span className="hidden font-medium text-topbar-foreground/65 sm:inline">
                Service System, Lda
              </span>
            </span>
          </Link>
        </div>

        <div className="hidden min-w-0 flex-col items-end text-[0.8rem] text-topbar-foreground/70 lg:flex">
          <span>{dataTexto}</span>
          <span className="font-semibold tabular-nums text-topbar-foreground/90">
            {horaTexto}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label="Alternar tema"
            title="Alternar modo claro / escuro"
            className="size-10 text-topbar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {iconeTema}
          </Button>

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
                  <span className="max-w-[160px] truncate text-[0.72rem] text-topbar-foreground/65">
                    {nivelTexto}
                  </span>
                </span>
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
                    <ImageIcon aria-hidden />
                    Personalizar portal
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() =>
                  toast.info("A troca da própria senha pelo perfil chega na próxima iteração.")
                }
                className="text-muted-foreground"
              >
                Trocar a minha senha (a seguir)
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
            : "w-[264px] -translate-x-full lg:w-[68px] lg:translate-x-0 " +
              (expandida ? "lg:w-[264px]" : ""))
        }
      >
        {/* Cabeçalho do menu no telemóvel (com o botão para fechar) */}
        <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-sidebar-border px-3 lg:hidden">
          <span className="flex items-center gap-2.5 pl-2 text-[0.95rem] font-bold text-sidebar-foreground">
            <Image
              src="/logos/danmo-logo.png"
              alt=""
              width={30}
              height={30}
              className="size-7.5 object-contain"
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

        <div className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-2.5">
          {modulos.map((m) => {
            const Icone = ICONES[m.icone] || Home;
            const temDetalhe = Boolean(m.sub?.length || m.grupos?.length);
            const emCartaz = m.fase > 0 || m.dev;
            const activo = m.id === "inicio" && caminho === "/";

            /* Cartaz: módulo ainda por migrar ou em desenvolvimento */
            if (emCartaz) {
              return (
                <div
                  key={m.id}
                  title={
                    m.dev
                      ? `${m.label} (em desenvolvimento)`
                      : `${m.label} (chega na Fase ${m.fase})`
                  }
                  className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sidebar-foreground/45"
                >
                  <Icone className="size-5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[0.88rem]">
                    {m.label}
                  </span>
                  {(mobileAberta || expandida) &&
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
                  className={
                    "relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors " +
                    (activo
                      ? "bg-sidebar-activo font-semibold text-sidebar-activo-texto"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")
                  }
                >
                  {activo && (
                    <span
                      aria-hidden
                      className="absolute top-1/2 left-0 h-6 w-1 -translate-y-1/2 rounded-r-full bg-ambar"
                    />
                  )}
                  <Icone className="size-5 shrink-0" aria-hidden />
                  <span
                    className={
                      "min-w-0 flex-1 truncate text-[0.88rem] " +
                      (!mobileAberta && !expandida ? "lg:hidden" : "")
                    }
                  >
                    {m.label}
                  </span>
                </Link>
              );
            }

            /* Módulo com páginas (a Oficina chega na Fase 3) */
            const esteAberto = expandida && moduloAberto === m.id;
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
                      (!mobileAberta && !expandida ? "lg:hidden" : "")
                    }
                  >
                    {m.label}
                  </span>
                  {(mobileAberta || expandida) && (
                    <ChevronDown
                      className={
                        "size-4 shrink-0 transition-transform " +
                        (esteAberto ? "rotate-180" : "")
                      }
                      aria-hidden
                    />
                  )}
                </button>

                {(mobileAberta || esteAberto) && (
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
                                  {grupo.itens.map((item) => (
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
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      : m.sub?.map((item) => (
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
                        ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-sidebar-border px-4 py-3">
          <p
            className={
              "text-[0.68rem] leading-relaxed text-sidebar-secundario " +
              (!mobileAberta && !expandida ? "lg:hidden" : "")
            }
          >
            danmo v3.0 - Danmo Service System, Lda
          </p>
        </div>
      </nav>

      {/* Clique fora recolhe a sidebar expandida (desktop) */}
      {expandida && (
        <div
          className="fixed inset-0 top-[60px] z-30 hidden lg:block"
          onClick={() => {
            setExpandida(false);
            setModuloAberto(null);
          }}
          aria-hidden
        />
      )}

      {/* ============ Conteúdo ============ */}
      <main className="min-h-screen pt-[60px] lg:pl-[68px]">
        <div className="mx-auto w-full max-w-[1200px] p-4 pb-10 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
