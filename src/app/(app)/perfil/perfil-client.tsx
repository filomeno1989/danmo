"use client";

/**
 * PerfilClient - Os meus dados.
 *
 * Dois cartões: a conta do portal (com troca de senha) e o cadastro do
 * colaborador em leitura, com "Pedir alteração" num campo escolhido. As
 * solicitações pendentes/resolvidas da própria pessoa ficam à vista.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, MessageSquarePlus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NIVEL_LABEL } from "@/lib/uso-comum";

type Cadastro = {
  encontrado: boolean;
  code?: string;
  name?: string;
  department?: string;
  categoria?: string;
  setor?: string;
  funcao_grupo?: string;
  contacto?: string;
  contacto_1?: string;
  contacto_2?: string;
  email?: string;
  endereco?: string;
  naturalidade?: string;
  estado_civil?: string;
  data_admissao?: string | null;
};

type MeusDados = {
  conta: { usuario: string; nome: string; cargo: string; nivel: string };
  cadastro: Cadastro | null;
};

type MinhaSolicitacao = {
  id: string;
  campo: string;
  valor_pretendido: string;
  estado: string;
  criado_em: string;
  resolvido_em: string | null;
  resposta: string;
};

const CAMPOS_LABEL: Record<string, string> = {
  department: "Departamento",
  categoria: "Categoria",
  setor: "Setor",
  funcao_grupo: "Função / grupo",
  contacto: "Contacto principal",
  contacto_1: "Contacto alternativo 1",
  contacto_2: "Contacto alternativo 2",
  email: "Email",
  endereco: "Endereço",
  naturalidade: "Naturalidade",
  estado_civil: "Estado civil",
  data_admissao: "Admissão"
};

/* Campos que aceitam solicitação (a mesma lista da base). */
const SOLICITAVEIS = [
  "contacto",
  "contacto_1",
  "contacto_2",
  "email",
  "endereco",
  "naturalidade",
  "estado_civil"
];

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

export function PerfilClient({ nome, usuario }: { nome: string; usuario: string }) {
  const router = useRouter();
  const [dados, setDados] = useState<MeusDados | null>(null);
  const [minhas, setMinhas] = useState<MinhaSolicitacao[]>([]);
  const [aCarregar, setACarregar] = useState(true);

  /* Diálogo de solicitação */
  const [dialogPedir, setDialogPedir] = useState(false);
  const [campoPedir, setCampoPedir] = useState("contacto");
  const [valorPedir, setValorPedir] = useState("");
  const [motivoPedir, setMotivoPedir] = useState("");
  const [aPedir, setAPedir] = useState(false);

  /* Diálogo de senha */
  const [dialogSenha, setDialogSenha] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [aTrocar, setATrocar] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const d = await pedir<{
        dados: MeusDados;
        minhas: MinhaSolicitacao[];
      }>("/api/portal/perfil");
      setDados(d.dados);
      setMinhas(d.minhas || []);
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

  const pedirAlteracao = async () => {
    setAPedir(true);
    try {
      await pedir("/api/portal/perfil", {
        action: "pedir",
        campo: campoPedir,
        valor: valorPedir,
        motivo: motivoPedir
      });
      toast.success("Solicitação enviada. A administração responde em Os meus dados.");
      setDialogPedir(false);
      setValorPedir("");
      setMotivoPedir("");
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAPedir(false);
    }
  };

  const trocarSenha = async () => {
    if (senhaNova.length < 6) {
      toast.error("A nova senha precisa de ter pelo menos 6 caracteres.");
      return;
    }
    if (senhaNova === senhaAtual) {
      toast.error("A nova senha não pode ser igual à actual.");
      return;
    }
    setATrocar(true);
    try {
      const res = await fetch("/api/auth/trocar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atual: senhaAtual, nova: senhaNova })
      });
      const d = (await res.json()) as { ok?: boolean; erro?: string };
      if (!res.ok || d.ok === false) throw new Error(d.erro || "Não foi possível.");
      // A sessão é fechada por segurança: entra com a senha nova.
      toast.success("Senha trocada. Entra de novo com a nova senha.");
      router.replace("/login?motivo=trocada");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setATrocar(false);
    }
  };

  const cad = dados?.cadastro || null;
  const conta = dados?.conta;
  const linhaDoCadastro = (campo: keyof Cadastro, extra?: boolean) => {
    const v = cad ? cad[campo] : "";
    if (!v) return null;
    return (
      <div
        key={String(campo)}
        className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0"
      >
        <span className="text-[0.8rem] text-muted-foreground">
          {CAMPOS_LABEL[String(campo)] || String(campo)}
        </span>
        <span className="min-w-0 text-right text-[0.86rem] font-medium">
          {String(campo) === "data_admissao" ? dataCurta(String(v)) : String(v)}
          {extra && SOLICITAVEIS.includes(String(campo)) ? (
            <button
              type="button"
              className="ml-2 text-[0.72rem] font-semibold text-primario hover:underline"
              onClick={() => {
                setCampoPedir(String(campo));
                setValorPedir("");
                setMotivoPedir("");
                setDialogPedir(true);
              }}
            >
              pedir alteração
            </button>
          ) : null}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Os meus dados</h1>
        <p className="mt-0.5 text-[0.84rem] text-muted-foreground">
          Os teus dados de conta e do cadastro da empresa. Se algo estiver errado,
          pedes a alteração e a administração resolve.
        </p>
      </div>

      {aCarregar ? (
        <Card className="card-sombra">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            A carregar os teus dados...
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Conta do portal */}
          <Card className="card-sombra py-0">
            <CardContent className="py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primario/10 text-primario">
                    <KeyRound className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-bold">{conta?.nome || nome}</p>
                    <p className="text-[0.78rem] text-muted-foreground">
                      Código {conta?.usuario || usuario} -{" "}
                      {NIVEL_LABEL[conta?.nivel || ""] || conta?.nivel || ""}
                      {conta?.cargo ? ` - ${conta.cargo}` : ""}
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => setDialogSenha(true)}>
                  <KeyRound className="size-4" aria-hidden />
                  Trocar a minha senha
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Cadastro */}
          <Card className="card-sombra py-0">
            <CardContent className="py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-bold">Cadastro de colaborador</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCampoPedir("contacto");
                    setValorPedir("");
                    setMotivoPedir("");
                    setDialogPedir(true);
                  }}
                >
                  <MessageSquarePlus className="size-4" aria-hidden />
                  Pedir alteração
                </Button>
              </div>

              {!cad || !cad.encontrado ? (
                <p className="mt-4 text-[0.84rem] leading-relaxed text-muted-foreground">
                  Não encontrei o teu cadastro de colaborador pelo código{" "}
                  {conta?.usuario || usuario}. Fala com a administração para
                  confirmar o código na base de colaboradores.
                </p>
              ) : (
                <>
                  <div className="mt-3 grid gap-x-8 md:grid-cols-2">
                    <div>
                      {linhaDoCadastro("code")}
                      {linhaDoCadastro("name")}
                      {linhaDoCadastro("department")}
                      {linhaDoCadastro("categoria")}
                      {linhaDoCadastro("setor")}
                      {linhaDoCadastro("funcao_grupo")}
                      {linhaDoCadastro("data_admissao")}
                    </div>
                    <div>
                      {linhaDoCadastro("contacto", true)}
                      {linhaDoCadastro("contacto_1", true)}
                      {linhaDoCadastro("contacto_2", true)}
                      {linhaDoCadastro("email", true)}
                      {linhaDoCadastro("endereco", true)}
                      {linhaDoCadastro("naturalidade", true)}
                      {linhaDoCadastro("estado_civil", true)}
                    </div>
                  </div>
                  <p className="mt-3 text-[0.74rem] leading-relaxed text-muted-foreground">
                    Só podes PEDIR alteração de contacto, email, endereço,
                    naturalidade e estado civil: escreves o valor certo e a
                    administração aplica ao cadastro. Os restantes campos são
                    geridos pela empresa.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* As minhas solicitações */}
          <Card className="card-sombra overflow-hidden py-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="font-bold">As minhas solicitações</h2>
              <Button variant="ghost" size="sm" onClick={carregar}>
                <RefreshCw className="size-4" aria-hidden />
                Actualizar
              </Button>
            </div>
            {minhas.length === 0 ? (
              <p className="px-5 py-6 text-center text-[0.82rem] text-muted-foreground">
                Ainda não pediste nenhuma alteração.
              </p>
            ) : (
              minhas.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="text-[0.84rem]">
                      <span className="text-muted-foreground">
                        {CAMPOS_LABEL[s.campo] || s.campo}:
                      </span>{" "}
                      <span className="font-semibold">{s.valor_pretendido}</span>
                    </p>
                    <p className="text-[0.72rem] text-muted-foreground">
                      {dataCurta(s.criado_em)}
                      {s.resposta ? ` - resposta: "${s.resposta}"` : ""}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      s.estado === "pendente"
                        ? "bg-aviso-bg text-aviso border-aviso/40"
                        : s.estado === "aplicada"
                          ? "bg-sucesso-bg text-sucesso border-sucesso/30"
                          : "bg-muted text-muted-foreground"
                    }
                  >
                    {s.estado === "pendente"
                      ? "À espera da administração"
                      : s.estado === "aplicada"
                        ? "Aplicada"
                        : "Ignorada"}
                  </Badge>
                </div>
              ))
            )}
          </Card>
        </>
      )}

      {/* ============ Diálogos ============ */}
      <Modal
        aberto={dialogPedir}
        fechar={() => setDialogPedir(false)}
        titulo="Pedir alteração de dado"
        subtitulo="A administração recebe o pedido e aplica ao cadastro, se estiver certo."
      >
        <div className="space-y-4 px-5 py-4">
          <div>
            <Label htmlFor="campo-pedir">Campo</Label>
            <select
              id="campo-pedir"
              value={campoPedir}
              onChange={(e) => setCampoPedir(e.target.value)}
              className="mt-1.5 h-9 w-full rounded-md border border-border bg-card px-3 text-[0.84rem] focus:outline-none focus:ring-2 focus:ring-primario/40"
            >
              {SOLICITAVEIS.map((c) => (
                <option key={c} value={c}>
                  {CAMPOS_LABEL[c] || c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="valor-pedir">Valor certo (como deve ficar)</Label>
            <Input
              id="valor-pedir"
              value={valorPedir}
              onChange={(e) => setValorPedir(e.target.value)}
              placeholder="Ex.: +258 84 123 4567"
            />
          </div>
          <div>
            <Label htmlFor="motivo-pedir">Motivo (opcional)</Label>
            <Input
              id="motivo-pedir"
              value={motivoPedir}
              onChange={(e) => setMotivoPedir(e.target.value)}
              placeholder="Ex.: mudei de número"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogPedir(false)}>
              Cancelar
            </Button>
            <Button onClick={pedirAlteracao} disabled={aPedir || !valorPedir.trim()}>
              Enviar solicitação
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        aberto={dialogSenha}
        fechar={() => setDialogSenha(false)}
        titulo="Trocar a minha senha"
        subtitulo="Depois de trocar, a sessão fecha e entras com a senha nova."
      >
        <div className="space-y-4 px-5 py-4">
          <div>
            <Label htmlFor="senha-atual">Senha actual</Label>
            <Input
              id="senha-atual"
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="senha-nova">Senha nova (6 ou mais)</Label>
            <Input
              id="senha-nova"
              type="password"
              value={senhaNova}
              onChange={(e) => setSenhaNova(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogSenha(false)}>
              Cancelar
            </Button>
            <Button
              onClick={trocarSenha}
              disabled={aTrocar || !senhaAtual || senhaNova.length < 6}
            >
              Trocar senha
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
