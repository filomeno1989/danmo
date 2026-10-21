"use client";

/**
 * PermissoesClient - Gestão de contas e da matriz POR UTILIZADOR.
 *
 * Modelo do Filomeno (Fase 7 R1):
 * - Atribuição 100% à mão: cada pessoa recebe, POR PÁGINA, as marcas
 *   Ver / Mexer / Apagar (Mexer cobre criar, editar e arquivar).
 * - Nada de modelos por cargo; apagar fica na administração na prática.
 * - Acções destrutivas (rejeitar registo, criar conta, reset de senha)
 *   pedem a chave de administração, como no hub.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  BadgeCheck,
  ChevronRight,
  CircleSlash,
  KeyRound,
  Search,
  ShieldCheck,
  UserRoundPlus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NIVEL_LABEL } from "@/lib/uso-comum";
import { PAGINAS, labelPagina, moduloPorId } from "@/lib/permissoes";

type Usuario = {
  id: string;
  usuario: string;
  nome: string;
  cargo: string;
  nivel: string;
  ativo: boolean;
  precisa_trocar: boolean;
  tem_permissoes: boolean;
};

type Solicitacao = {
  id: string;
  utilizador: string;
  nome: string;
  campo: string;
  valor_pretendido: string;
  motivo: string;
  estado: string;
  criado_em: string;
  resolvido_em: string | null;
  resposta: string;
};

type LinhaMatriz = { pagina: string; ver: boolean; mexer: boolean; apagar: boolean };

const CAMPOS_LABEL: Record<string, string> = {
  contacto: "Contacto principal",
  contacto_1: "Contacto alternativo 1",
  contacto_2: "Contacto alternativo 2",
  email: "Email",
  endereco: "Endereço",
  naturalidade: "Naturalidade",
  estado_civil: "Estado civil"
};

const ROTULOS = ["gestor", "operador", "consulta"];

async function pedir<T>(url: string, corpo?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: corpo ? "POST" : "GET",
    headers: corpo ? { "Content-Type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const d = (await res.json()) as T & { ok?: boolean; erro?: string };
  if (!res.ok || d.ok === false) throw new Error(d.erro || "Não foi possível.");
  return d;
}

function dataCurta(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("pt-PT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Africa/Maputo"
    });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Interruptor de 3 marcas da matriz (cascata tratada pelo pai). */
function Interruptor({
  activo,
  desactivado,
  onClick,
  titulo
}: {
  activo: boolean;
  desactivado?: boolean;
  onClick: () => void;
  titulo: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={titulo}
      title={desactivado ? `${titulo} (liga primeiro o de baixo)` : titulo}
      disabled={desactivado}
      onClick={onClick}
      className={
        "relative h-5.5 w-10 shrink-0 rounded-full transition-colors " +
        (activo
          ? "bg-sucesso"
          : desactivado
            ? "bg-muted opacity-60"
            : "bg-muted hover:bg-border") +
        " " +
        (desactivado ? "cursor-not-allowed" : "cursor-pointer")
      }
    >
      <span
        className={
          "absolute top-0.5 size-4.5 rounded-full bg-white shadow transition-all " +
          (activo ? "left-[22px]" : "left-0.5")
        }
      />
    </button>
  );
}

export function PermissoesClient({ nomeAdmin }: { nomeAdmin: string }) {
  const [aba, setAba] = useState<"utilizadores" | "matriz" | "solicitacoes">(
    "utilizadores"
  );
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [busca, setBusca] = useState("");

  /* ---- Matriz ---- */
  const [pessoaId, setPessoaId] = useState<string>("");
  const [matriz, setMatriz] = useState<LinhaMatriz[]>([]);
  const [aGravar, setAGravar] = useState<string>("");

  /* ---- Diálogos ---- */
  const [dialogAprovar, setDialogAprovar] = useState<Usuario | null>(null);
  const [rotuloAprovar, setRotuloAprovar] = useState("consulta");
  const [dialogRejeitar, setDialogRejeitar] = useState<Usuario | null>(null);
  const [chaveRejeitar, setChaveRejeitar] = useState("");
  const [dialogCriar, setDialogCriar] = useState(false);
  const [novoCodigo, setNovoCodigo] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [novoRotulo, setNovoRotulo] = useState("consulta");
  const [chaveCriar, setChaveCriar] = useState("");
  const [dialogReset, setDialogReset] = useState<Usuario | null>(null);
  const [senhaReset, setSenhaReset] = useState("");
  const [chaveReset, setChaveReset] = useState("");
  const [dialogRotulo, setDialogRotulo] = useState<Usuario | null>(null);
  const [dialogActivar, setDialogActivar] = useState<Usuario | null>(null);
  const [dialogResolver, setDialogResolver] = useState<{
    s: Solicitacao;
    aplicar: boolean;
  } | null>(null);
  const [respostaResolver, setRespostaResolver] = useState("");

  const [aCorrer, setACorrer] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const d = await pedir<{ usuarios: Usuario[]; solicitacoes: Solicitacao[] }>(
        "/api/portal/permissoes"
      );
      setUsuarios(d.usuarios || []);
      setSolicitacoes(d.solicitacoes || []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setACarregar(false);
    }
  }, []);

  useEffect(() => {
    // Primeira carga adiada de um tick (regra react-hooks/set-state-in-effect,
    // mesmo padrão do relógio no shell)
    const t = setTimeout(() => {
      carregar();
    }, 0);
    return () => clearTimeout(t);
  }, [carregar]);

  const abrirMatriz = async (u: Usuario) => {
    if (u.nivel === "admin") {
      toast.info("A administração tem sempre acesso total; não se limita uma conta admin.");
      return;
    }
    setAba("matriz");
    setPessoaId(u.id);
    setMatriz([]);
    try {
      const d = await pedir<{ matriz: LinhaMatriz[] }>("/api/portal/permissoes", {
        action: "matriz",
        utilizador_id: u.id
      });
      setMatriz(d.matriz || []);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const linhaDe = (pagina: string): LinhaMatriz =>
    matriz.find((l) => l.pagina === pagina) || { pagina, ver: false, mexer: false, apagar: false };

  const gravar = async (
    pagina: string,
    ver: boolean,
    mexer: boolean,
    apagar: boolean
  ) => {
    if (!pessoaId) return;
    setAGravar(pagina);
    // cascata local igual à da base (mexer exige ver; apagar exige mexer)
    if (!ver) {
      mexer = false;
      apagar = false;
    } else if (!mexer) {
      apagar = false;
    }
    const nova = matriz.filter((l) => l.pagina !== pagina);
    if (ver || mexer || apagar) nova.push({ pagina, ver, mexer, apagar });
    setMatriz(nova);
    try {
      await pedir("/api/portal/permissoes", {
        action: "gravar-pagina",
        utilizador_id: pessoaId,
        pagina,
        ver,
        mexer,
        apagar
      });
      toast.success(`${labelPagina(pagina)}: gravado.`);
    } catch (e) {
      toast.error((e as Error).message);
      carregar();
    } finally {
      setAGravar("");
    }
  };

  const correr = async (corpo: Record<string, unknown>, msgOk: string) => {
    setACorrer(true);
    try {
      await pedir("/api/portal/permissoes", corpo);
      toast.success(msgOk);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setACorrer(false);
    }
  };

  const aprovar = async () => {
    if (!dialogAprovar) return;
    const ok = await correr(
      { action: "aprovar", utilizador_id: dialogAprovar.id, nivel: rotuloAprovar },
      `Registo aprovado como ${NIVEL_LABEL[rotuloAprovar] || rotuloAprovar}.`
    );
    if (ok) {
      setDialogAprovar(null);
      carregar();
    }
  };

  const rejeitar = async () => {
    if (!dialogRejeitar) return;
    const ok = await correr(
      {
        action: "rejeitar",
        utilizador_id: dialogRejeitar.id,
        chave: chaveRejeitar
      },
      "Registo rejeitado: a conta foi apagada."
    );
    if (ok) {
      setDialogRejeitar(null);
      setChaveRejeitar("");
      carregar();
    }
  };

  const criarConta = async () => {
    const ok = await correr(
      {
        action: "criar-conta",
        codigo: novoCodigo,
        senha: novaSenha,
        nivel: novoRotulo,
        chave: chaveCriar
      },
      "Conta criada. A pessoa troca a senha ao entrar."
    );
    if (ok) {
      setDialogCriar(false);
      setNovoCodigo("");
      setNovaSenha("");
      setChaveCriar("");
      carregar();
    }
  };

  const resetSenha = async () => {
    if (!dialogReset) return;
    const ok = await correr(
      {
        action: "reset-senha",
        utilizador_id: dialogReset.id,
        senha_nova: senhaReset,
        chave: chaveReset
      },
      "Senha redefinida: a pessoa troca no próximo login."
    );
    if (ok) {
      setDialogReset(null);
      setSenhaReset("");
      setChaveReset("");
      carregar();
    }
  };

  const activar = async () => {
    if (!dialogActivar) return;
    const vaiActivar = !(dialogActivar.ativo !== false);
    const ok = await correr(
      { action: "activar", utilizador_id: dialogActivar.id, activo: vaiActivar },
      vaiActivar ? "Conta reactivada." : "Conta desactivada (o histórico fica)."
    );
    if (ok) {
      setDialogActivar(null);
      carregar();
    }
  };

  const mudarRotulo = async (nivel: string) => {
    if (!dialogRotulo) return;
    const ok = await correr(
      { action: "nivel", utilizador_id: dialogRotulo.id, nivel },
      "Rótulo mudado (não muda permissões)."
    );
    if (ok) {
      setDialogRotulo(null);
      carregar();
    }
  };

  const resolver = async () => {
    if (!dialogResolver) return;
    const ok = await correr(
      {
        action: "resolver-solicitacao",
        solicitacao_id: dialogResolver.s.id,
        aplicar: dialogResolver.aplicar,
        resposta: respostaResolver
      },
      dialogResolver.aplicar
        ? "Solicitação aplicada ao cadastro do colaborador."
        : "Solicitação ignorada e marcada como resolvida."
    );
    if (ok) {
      setDialogResolver(null);
      setRespostaResolver("");
      carregar();
    }
  };

  /* ---- Listas derivadas ---- */
  const pendentes = useMemo(
    () => usuarios.filter((u) => u.nivel === "pendente"),
    [usuarios]
  );
  const activos = useMemo(
    () =>
      usuarios.filter(
        (u) =>
          u.nivel !== "pendente" &&
          u.nivel !== "admin" &&
          (u.ativo !== false)
      ),
    [usuarios]
  );
  const desactivadas = useMemo(() => usuarios.filter((u) => u.ativo === false), [usuarios]);
  const admins = useMemo(() => usuarios.filter((u) => u.nivel === "admin"), [usuarios]);

  const filtra = (lista: Usuario[]) => {
    const b = busca.trim().toLowerCase();
    if (!b) return lista;
    return lista.filter(
      (u) =>
        u.nome.toLowerCase().includes(b) ||
        u.usuario.toLowerCase().includes(b) ||
        (u.cargo || "").toLowerCase().includes(b)
    );
  };

  const pessoaMatriz = usuarios.find((u) => u.id === pessoaId) || null;

  const pendentesNovas = solicitacoes.filter((s) => s.estado === "pendente");
  const resolvidas = solicitacoes.filter((s) => s.estado !== "pendente");

  const modulosComPaginas = useMemo(() => {
    const grupos: { modulo: string; paginas: string[] }[] = [];
    for (const p of PAGINAS) {
      const g = grupos.find((x) => x.modulo === p.modulo);
      if (g) g.paginas.push(p.pagina);
      else grupos.push({ modulo: p.modulo, paginas: [p.pagina] });
    }
    return grupos;
  }, []);

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Permissões</h1>
          <p className="mt-0.5 text-[0.84rem] text-muted-foreground">
            Contas e acessos por utilizador, página a página. Atribuição à mão,
            por {nomeAdmin || "administração"}.
          </p>
        </div>
        <Button onClick={() => setDialogCriar(true)}>
          <UserRoundPlus className="size-4" aria-hidden />
          Criar conta
        </Button>
      </div>

      {/* Abas */}
      <div className="flex gap-1 rounded-xl border border-border bg-card p-1 card-sombra">
        {(
          [
            ["utilizadores", `Utilizadores${pendentes.length ? ` (${pendentes.length} por aprovar)` : ""}`],
            ["matriz", "Matriz de permissões"],
            ["solicitacoes", `Solicitações${pendentesNovas.length ? ` (${pendentesNovas.length})` : ""}`]
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            aria-current={aba === id ? "true" : undefined}
            className={
              "flex-1 rounded-lg px-3 py-2 text-[0.82rem] font-semibold transition-colors " +
              (aba === id
                ? "bg-primario text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {aCarregar ? (
        <Card className="card-sombra">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            A carregar contas...
          </CardContent>
        </Card>
      ) : aba === "utilizadores" ? (
        <AbaUtilizadores
          pendentes={pendentes}
          activos={filtra(activos)}
          desactivadas={filtra(desactivadas)}
          admins={admins}
          busca={busca}
          setBusca={setBusca}
          abrirMatriz={abrirMatriz}
          aprovar={(u) => {
            setRotuloAprovar("consulta");
            setDialogAprovar(u);
          }}
          rejeitar={setDialogRejeitar}
          resetSenha={setDialogReset}
          mudarRotulo={setDialogRotulo}
          activar={setDialogActivar}
        />
      ) : aba === "matriz" ? (
        <AbaMatriz
          usuarios={[...pendentes, ...activos, ...desactivadas]}
          pessoaId={pessoaId}
          setPessoaId={(id) => {
            const u = usuarios.find((x) => x.id === id);
            if (u) abrirMatriz(u);
          }}
          pessoa={pessoaMatriz}
          matriz={matriz}
          linhaDe={linhaDe}
          gravar={gravar}
          aGravar={aGravar}
          modulosComPaginas={modulosComPaginas}
        />
      ) : (
        <AbaSolicitacoes
          pendentes={pendentesNovas}
          resolvidas={resolvidas}
          resolver={(s, aplicar) => {
            setRespostaResolver("");
            setDialogResolver({ s, aplicar });
          }}
        />
      )}

      {/* ============ Diálogos ============ */}
      <Modal
        aberto={Boolean(dialogAprovar)}
        fechar={() => setDialogAprovar(null)}
        titulo="Aprovar registo"
        subtitulo={
          dialogAprovar
            ? `${dialogAprovar.nome} (${dialogAprovar.usuario}) - ${dialogAprovar.cargo || "sem cargo"}`
            : ""
        }
      >
        <div className="space-y-4 px-5 py-4">
          <div>
            <Label>Etiqueta da conta (não muda permissões)</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {ROTULOS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRotuloAprovar(r)}
                  className={
                    "rounded-lg border px-3 py-2 text-[0.82rem] font-semibold transition-colors " +
                    (rotuloAprovar === r
                      ? "border-primario bg-primario/10 text-primario"
                      : "border-border text-muted-foreground hover:bg-muted")
                  }
                >
                  {NIVEL_LABEL[r] || r}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[0.8rem] leading-relaxed text-muted-foreground">
            Depois de aprovar, dá as permissões dela na aba Matriz de permissões:
            escolhe a pessoa e marca Ver / Mexer / Apagar, página a página.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogAprovar(null)}>
              Cancelar
            </Button>
            <Button onClick={aprovar} disabled={aCorrer}>
              <BadgeCheck className="size-4" aria-hidden />
              Aprovar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        aberto={Boolean(dialogRejeitar)}
        fechar={() => setDialogRejeitar(null)}
        titulo="Rejeitar registo"
        subtitulo="Acção destrutiva: apaga a conta pendente que nunca foi usada."
      >
        <div className="space-y-4 px-5 py-4">
          <p className="text-[0.84rem] leading-relaxed">
            {dialogRejeitar
              ? `${dialogRejeitar.nome} (${dialogRejeitar.usuario}) sai da lista e a conta é apagada.`
              : ""}
          </p>
          <div>
            <Label htmlFor="chave-rejeitar">Chave de administração</Label>
            <Input
              id="chave-rejeitar"
              type="password"
              value={chaveRejeitar}
              onChange={(e) => setChaveRejeitar(e.target.value)}
              placeholder="Confirma com a tua chave"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogRejeitar(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={rejeitar} disabled={aCorrer || !chaveRejeitar}>
              Rejeitar e apagar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        aberto={dialogCriar}
        fechar={() => setDialogCriar(false)}
        titulo="Criar conta"
        subtitulo="O código tem de existir e estar activo na base de colaboradores."
      >
        <div className="space-y-4 px-5 py-4">
          <div>
            <Label htmlFor="novo-codigo">Código do colaborador</Label>
            <Input
              id="novo-codigo"
              value={novoCodigo}
              onChange={(e) => setNovoCodigo(e.target.value)}
              placeholder="Ex.: DM0101"
              className="uppercase"
            />
          </div>
          <div>
            <Label htmlFor="nova-senha">Senha temporária (6 ou mais)</Label>
            <Input
              id="nova-senha"
              type="text"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              placeholder="A pessoa troca ao entrar"
            />
          </div>
          <div>
            <Label>Etiqueta</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {ROTULOS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setNovoRotulo(r)}
                  className={
                    "rounded-lg border px-3 py-2 text-[0.82rem] font-semibold transition-colors " +
                    (novoRotulo === r
                      ? "border-primario bg-primario/10 text-primario"
                      : "border-border text-muted-foreground hover:bg-muted")
                  }
                >
                  {NIVEL_LABEL[r] || r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="chave-criar">Chave de administração</Label>
            <Input
              id="chave-criar"
              type="password"
              value={chaveCriar}
              onChange={(e) => setChaveCriar(e.target.value)}
              placeholder="Confirma com a tua chave"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogCriar(false)}>
              Cancelar
            </Button>
            <Button
              onClick={criarConta}
              disabled={aCorrer || !novoCodigo || novaSenha.length < 6 || !chaveCriar}
            >
              Criar conta
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        aberto={Boolean(dialogReset)}
        fechar={() => setDialogReset(null)}
        titulo="Redefinir senha"
        subtitulo={
          dialogReset
            ? `${dialogReset.nome} (${dialogReset.usuario}) entra com a senha nova e é obrigado a trocá-la.`
            : ""
        }
      >
        <div className="space-y-4 px-5 py-4">
          <div>
            <Label htmlFor="senha-reset">Senha temporária (6 ou mais)</Label>
            <Input
              id="senha-reset"
              type="text"
              value={senhaReset}
              onChange={(e) => setSenhaReset(e.target.value)}
              placeholder="A pessoa troca no próximo login"
            />
          </div>
          <div>
            <Label htmlFor="chave-reset">Chave de administração</Label>
            <Input
              id="chave-reset"
              type="password"
              value={chaveReset}
              onChange={(e) => setChaveReset(e.target.value)}
              placeholder="Confirma com a tua chave"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogReset(null)}>
              Cancelar
            </Button>
            <Button
              onClick={resetSenha}
              disabled={aCorrer || senhaReset.length < 6 || !chaveReset}
            >
              <KeyRound className="size-4" aria-hidden />
              Redefinir
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        aberto={Boolean(dialogRotulo)}
        fechar={() => setDialogRotulo(null)}
        titulo="Mudar etiqueta"
        subtitulo={
          dialogRotulo
            ? `${dialogRotulo.nome} (${dialogRotulo.usuario}) - a etiqueta não muda as permissões.`
            : ""
        }
      >
        <div className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-3 gap-2">
            {ROTULOS.map((r) => (
              <Button
                key={r}
                variant="outline"
                onClick={() => mudarRotulo(r)}
                disabled={aCorrer}
              >
                {NIVEL_LABEL[r] || r}
              </Button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        aberto={Boolean(dialogActivar)}
        fechar={() => setDialogActivar(null)}
        titulo={
          dialogActivar && dialogActivar.ativo === false
            ? "Reactivar conta"
            : "Desactivar conta"
        }
        subtitulo={
          dialogActivar
            ? `${dialogActivar.nome} (${dialogActivar.usuario})`
            : ""
        }
      >
        <div className="space-y-4 px-5 py-4">
          <p className="text-[0.84rem] leading-relaxed text-muted-foreground">
            {dialogActivar && dialogActivar.ativo === false
              ? "A pessoa volta a entrar com a senha que já tem e as permissões dela voltam ao mesmo."
              : "A pessoa deixa de conseguir entrar. Não se apaga nada: o histórico fica e podes reactivar quando quiseres."}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogActivar(null)}>
              Cancelar
            </Button>
            <Button
              variant={dialogActivar && dialogActivar.ativo === false ? "default" : "destructive"}
              onClick={activar}
              disabled={aCorrer}
            >
              Confirmar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        aberto={Boolean(dialogResolver)}
        fechar={() => setDialogResolver(null)}
        titulo={
          dialogResolver?.aplicar
            ? "Aplicar solicitação"
            : "Ignorar solicitação"
        }
        subtitulo={
          dialogResolver
            ? `${dialogResolver.s.nome} pediu mudar ${CAMPOS_LABEL[dialogResolver.s.campo] || dialogResolver.s.campo}.`
            : ""
        }
      >
        <div className="space-y-4 px-5 py-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[0.84rem]">
            <p>
              <span className="text-muted-foreground">Valor pretendido:</span>{" "}
              <span className="font-semibold">{dialogResolver?.s.valor_pretendido}</span>
            </p>
            {dialogResolver?.s.motivo ? (
              <p className="mt-1">
                <span className="text-muted-foreground">Motivo:</span>{" "}
                {dialogResolver.s.motivo}
              </p>
            ) : null}
          </div>
          {dialogResolver?.aplicar ? (
            <p className="text-[0.8rem] leading-relaxed text-muted-foreground">
              Ao aplicar, o valor é gravado no cadastro de colaboradores
              ({CAMPOS_LABEL[dialogResolver.s.campo] || dialogResolver.s.campo}).
              Confere o valor antes.
            </p>
          ) : null}
          <div>
            <Label htmlFor="resposta-resolver">Resposta para a pessoa (opcional)</Label>
            <Input
              id="resposta-resolver"
              value={respostaResolver}
              onChange={(e) => setRespostaResolver(e.target.value)}
              placeholder="Ex.: aplicado hoje / fala com o RH"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogResolver(null)}>
              Cancelar
            </Button>
            <Button
              variant={dialogResolver?.aplicar ? "default" : "outline"}
              onClick={resolver}
              disabled={aCorrer}
            >
              {dialogResolver?.aplicar ? "Aplicar ao cadastro" : "Ignorar"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ================================================================
 * ABA UTILIZADORES
 * ================================================================ */

function LinhaUtilizador({
  u,
  abrirMatriz,
  aprovar,
  rejeitar,
  resetSenha,
  mudarRotulo,
  activar
}: {
  u: Usuario;
  abrirMatriz: (u: Usuario) => void;
  aprovar: (u: Usuario) => void;
  rejeitar: (u: Usuario) => void;
  resetSenha: (u: Usuario) => void;
  mudarRotulo: (u: Usuario) => void;
  activar: (u: Usuario) => void;
}) {
  const nivel = NIVEL_LABEL[u.nivel] || u.nivel;
  const desactivada = u.ativo === false;
  return (
    <div
      className={
        "flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0 " +
        (desactivada ? "opacity-60" : "")
      }
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-[0.9rem] font-semibold">
          {u.nome}
          {u.nivel === "pendente" ? (
            <Badge variant="outline" className="bg-aviso-bg text-aviso border-aviso/40">
              Por aprovar
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              {nivel}
            </Badge>
          )}
          {u.precisa_trocar && (
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              Senha temporária
            </Badge>
          )}
          {desactivada && (
            <Badge variant="outline" className="bg-erro-bg text-erro border-erro/30">
              Desactivada
            </Badge>
          )}
        </p>
        <p className="mt-0.5 text-[0.76rem] text-muted-foreground">
          {u.usuario}
          {u.cargo ? ` - ${u.cargo}` : ""}
          {u.tem_permissoes ? " - já tem permissões" : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {u.nivel === "pendente" ? (
          <>
            <Button size="sm" onClick={() => aprovar(u)} disabled={desactivada}>
              <BadgeCheck className="size-3.5" aria-hidden />
              Aprovar
            </Button>
            <Button size="sm" variant="outline" onClick={() => rejeitar(u)}>
              Rejeitar
            </Button>
          </>
        ) : u.nivel === "admin" ? (
          <span className="flex items-center gap-1.5 text-[0.74rem] text-muted-foreground">
            <ShieldCheck className="size-3.5 text-sucesso" aria-hidden />
            Acesso total (administração)
          </span>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => abrirMatriz(u)}>
              <KeyRound className="size-3.5" aria-hidden />
              Permissões
            </Button>
            <Button size="sm" variant="ghost" onClick={() => mudarRotulo(u)}>
              Etiqueta
            </Button>
            <Button size="sm" variant="ghost" onClick={() => resetSenha(u)}>
              Redefinir senha
            </Button>
            <Button size="sm" variant="ghost" onClick={() => activar(u)}>
              {desactivada ? "Activar" : "Desactivar"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function AbaUtilizadores({
  pendentes,
  activos,
  desactivadas,
  admins,
  busca,
  setBusca,
  abrirMatriz,
  aprovar,
  rejeitar,
  resetSenha,
  mudarRotulo,
  activar
}: {
  pendentes: Usuario[];
  activos: Usuario[];
  desactivadas: Usuario[];
  admins: Usuario[];
  busca: string;
  setBusca: (v: string) => void;
  abrirMatriz: (u: Usuario) => void;
  aprovar: (u: Usuario) => void;
  rejeitar: (u: Usuario) => void;
  resetSenha: (u: Usuario) => void;
  mudarRotulo: (u: Usuario) => void;
  activar: (u: Usuario) => void;
}) {
  const linha = (u: Usuario) => (
    <LinhaUtilizador
      key={u.id}
      u={u}
      abrirMatriz={abrirMatriz}
      aprovar={aprovar}
      rejeitar={rejeitar}
      resetSenha={resetSenha}
      mudarRotulo={mudarRotulo}
      activar={activar}
    />
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, código ou cargo..."
          className="pl-9"
        />
      </div>

      {pendentes.length > 0 && (
        <Card className="card-sombra overflow-hidden py-0">
          <div className="border-b border-aviso/30 bg-aviso-bg px-4 py-2.5">
            <p className="text-[0.82rem] font-bold text-aviso">
              Registos por aprovar ({pendentes.length})
            </p>
            <p className="text-[0.74rem] text-muted-foreground">
              Criaram o acesso com o código de colaborador e estão à espera de ti.
            </p>
          </div>
          {pendentes.map(linha)}
        </Card>
      )}

      <Card className="card-sombra overflow-hidden py-0">
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-[0.82rem] font-bold">Contas activas ({activos.length})</p>
        </div>
        {activos.length ? activos.map(linha) : (
          <p className="px-4 py-6 text-center text-[0.8rem] text-muted-foreground">
            Nenhuma conta com essa busca.
          </p>
        )}
        {admins.map(linha)}
      </Card>

      {desactivadas.length > 0 && (
        <Card className="card-sombra overflow-hidden py-0">
          <div className="border-b border-border px-4 py-2.5">
            <p className="text-[0.82rem] font-bold">Contas desactivadas ({desactivadas.length})</p>
            <p className="text-[0.74rem] text-muted-foreground">
              O histórico fica; podes reactivar quando quiseres.
            </p>
          </div>
          {desactivadas.map(linha)}
        </Card>
      )}
    </div>
  );
}

/* ================================================================
 * ABA MATRIZ (permissões por página)
 * ================================================================ */

function AbaMatriz({
  usuarios,
  pessoaId,
  setPessoaId,
  pessoa,
  matriz,
  linhaDe,
  gravar,
  aGravar,
  modulosComPaginas
}: {
  usuarios: Usuario[];
  pessoaId: string;
  setPessoaId: (id: string) => void;
  pessoa: Usuario | null;
  matriz: LinhaMatriz[];
  linhaDe: (pagina: string) => LinhaMatriz;
  gravar: (pagina: string, ver: boolean, mexer: boolean, apagar: boolean) => void;
  aGravar: string;
  modulosComPaginas: { modulo: string; paginas: string[] }[];
}) {
  return (
    <div className="space-y-4">
      <Card className="card-sombra py-0">
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <div className="min-w-0 flex-1">
            <Label htmlFor="pessoa-matriz">Escolhe a pessoa</Label>
            <select
              id="pessoa-matriz"
              value={pessoaId}
              onChange={(e) => setPessoaId(e.target.value)}
              className="mt-1.5 h-9 w-full max-w-md rounded-md border border-border bg-card px-3 text-[0.84rem] focus:outline-none focus:ring-2 focus:ring-primario/40"
            >
              <option value="">Selecionar...</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome} ({u.usuario}){u.nivel !== "pendente" ? ` - ${NIVEL_LABEL[u.nivel] || u.nivel}` : " - por aprovar"}
                </option>
              ))}
            </select>
          </div>
          {pessoa && (
            <div className="text-right text-[0.76rem] text-muted-foreground">
              {pessoa.tem_permissoes ? (
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-sucesso" aria-hidden />
                  Já tem permissões gravadas
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <CircleSlash className="size-3.5" aria-hidden />
                  Sem nenhuma permissão ainda
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!pessoaId || !pessoa ? (
        <Card className="card-sombra">
          <CardContent className="py-10 text-center text-[0.84rem] text-muted-foreground">
            Escolhe uma pessoa em cima para ver e marcar as permissões dela.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-[0.8rem] leading-relaxed text-muted-foreground">
            Marca <span className="font-semibold text-foreground">Ver</span> para a
            pessoa abrir a página, <span className="font-semibold text-foreground">Mexer</span> para
            criar/editar/arquivar e <span className="font-semibold text-foreground">Apagar</span> para
            apagar registos. Página sem marca = bloqueada. A cascata é automática:
            Mexer exige Ver; Apagar exige Mexer.
          </p>

          {modulosComPaginas.map((grupo) => {
            const mod = moduloPorId(grupo.modulo);
            return (
              <Card key={grupo.modulo} className="card-sombra overflow-hidden py-0">
                <div className="border-b border-border px-4 py-2.5">
                  <p className="text-[0.82rem] font-bold">{mod?.label || grupo.modulo}</p>
                </div>
                <div>
                  {grupo.paginas.map((pag) => {
                    const l = linhaDe(pag);
                    const gravando = aGravar === pag;
                    return (
                      <div
                        key={pag}
                        className={
                          "flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0 " +
                          (gravando ? "opacity-60" : "")
                        }
                      >
                        <p className="min-w-0 text-[0.86rem] font-medium">
                          {labelPagina(pag)}
                          {l.ver || l.mexer || l.apagar ? null : (
                            <span className="ml-2 text-[0.72rem] font-normal text-muted-foreground">
                              (bloqueada)
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1.5">
                            <span className="text-[0.72rem] text-muted-foreground">Ver</span>
                            <Interruptor
                              titulo="Ver"
                              activo={l.ver}
                              onClick={() => gravar(pag, !l.ver, l.mexer, l.apagar)}
                            />
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="text-[0.72rem] text-muted-foreground">Mexer</span>
                            <Interruptor
                              titulo="Mexer"
                              desactivado={!l.ver}
                              activo={l.mexer}
                              onClick={() => gravar(pag, true, !l.mexer, l.apagar)}
                            />
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="text-[0.72rem] text-muted-foreground">Apagar</span>
                            <Interruptor
                              titulo="Apagar"
                              desactivado={!l.mexer}
                              activo={l.apagar}
                              onClick={() => gravar(pag, true, true, !l.apagar)}
                            />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}

          <p className="text-[0.74rem] text-muted-foreground">
            Início e os dados próprios de cada pessoa são garantidos a todos e não
            aparecem aqui. As páginas por migrar (HST, Ferramentaria, RH...) ficam
            bloqueadas para todos até chegarem.
          </p>
        </div>
      )}
    </div>
  );
}

/* ================================================================
 * ABA SOLICITAÇÕES (dados próprios pedidos à administração)
 * ================================================================ */

function AbaSolicitacoes({
  pendentes,
  resolvidas,
  resolver
}: {
  pendentes: Solicitacao[];
  resolvidas: Solicitacao[];
  resolver: (s: Solicitacao, aplicar: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <Card className="card-sombra overflow-hidden py-0">
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-[0.82rem] font-bold">
            Pendentes ({pendentes.length})
          </p>
          <p className="text-[0.74rem] text-muted-foreground">
            Os colegas pedem para mudar os próprios dados; tu decides se aplicas
            ao cadastro ou se ignoras. O próprio nunca edita directamente.
          </p>
        </div>
        {pendentes.length === 0 ? (
          <p className="px-4 py-6 text-center text-[0.8rem] text-muted-foreground">
            Nenhuma solicitação pendente.
          </p>
        ) : (
          pendentes.map((s) => (
            <div key={s.id} className="border-b border-border px-4 py-3 last:border-b-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.88rem] font-semibold">
                    {s.nome}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({s.utilizador})
                    </span>
                  </p>
                  <p className="mt-0.5 text-[0.8rem]">
                    <span className="text-muted-foreground">
                      {CAMPOS_LABEL[s.campo] || s.campo}:
                    </span>{" "}
                    <span className="font-semibold">{s.valor_pretendido}</span>
                  </p>
                  {s.motivo ? (
                    <p className="mt-0.5 text-[0.78rem] text-muted-foreground">
                      Motivo: {s.motivo}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-[0.72rem] text-muted-foreground">
                    Pedida em {dataCurta(s.criado_em)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" onClick={() => resolver(s, true)}>
                    Aplicar ao cadastro
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => resolver(s, false)}>
                    Ignorar
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </Card>

      {resolvidas.length > 0 && (
        <Card className="card-sombra overflow-hidden py-0">
          <div className="border-b border-border px-4 py-2.5">
            <p className="text-[0.82rem] font-bold">
              Resolvidas ({resolvidas.length})
            </p>
          </div>
          {resolvidas.map((s) => (
            <div key={s.id} className="border-b border-border px-4 py-2.5 last:border-b-0">
              <p className="text-[0.84rem]">
                <span className="font-semibold">{s.nome}</span>
                {" "}
                <span className="text-muted-foreground">
                  - {CAMPOS_LABEL[s.campo] || s.campo} - {s.valor_pretendido}
                </span>
              </p>
              <p className="mt-0.5 text-[0.74rem] text-muted-foreground">
                <Badge
                  variant="outline"
                  className={
                    "mr-2 " +
                    (s.estado === "aplicada"
                      ? "bg-sucesso-bg text-sucesso border-sucesso/30"
                      : "bg-muted text-muted-foreground")
                  }
                >
                  {s.estado === "aplicada" ? "Aplicada" : "Ignorada"}
                </Badge>
                {dataCurta(s.resolvido_em)}
                {s.resposta ? ` - "${s.resposta}"` : ""}
              </p>
            </div>
          ))}
        </Card>
      )}

      <p className="flex items-center gap-1.5 text-[0.74rem] text-muted-foreground">
        <ChevronRight className="size-3" aria-hidden />
        Cada pessoa vê o estado dos seus próprios pedidos em Os meus dados.
      </p>
    </div>
  );
}

