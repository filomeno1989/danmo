"use client";

/**
 * Registo da gente da escala (cliente): lista com pesquisa sem
 * acentos, modal nova/edição e desactivar/activar. Duplicados de
 * código e nome são recusados pelo SERVIDOR (409), não pelo ecrã.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir, Rodar } from "@/components/oficina/ui-bits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { semAcentos } from "@/lib/uso-comum";
import { AREAS_ESCALA, problemaColab, type EscColab } from "@/lib/escalas";

type Resposta = { ok: boolean; sqlFalta?: boolean; colaboradores: EscColab[] };

export function ColaboradoresClient({ podeMexer, podeApagar }: { podeMexer: boolean; podeApagar: boolean }) {
  const [lista, setLista] = useState<EscColab[] | null>(null);
  const [falha, setFalha] = useState("");
  const [busca, setBusca] = useState("");
  const [soAtivos, setSoAtivos] = useState(true);
  const [dialog, setDialog] = useState<EscColab | "nova" | null>(null);
  const [form, setForm] = useState({
    codigo: "",
    nome: "",
    contacto: "",
    categoria: "",
    area: "Outros",
    grupo: "",
    ordem: "999"
  });
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async (): Promise<EscColab[]> => {
    const d = await pedir<Resposta>("/api/escalas/colaboradores");
    return d.colaboradores || [];
  }, []);

  useEffect(() => {
    let vivo = true;
    carregar()
      .then((lista) => {
        if (!vivo) return;
        setLista(lista);
        setFalha("");
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    return () => {
      vivo = false;
    };
  }, [carregar]);

  const gente = useMemo(() => {
    const filtro = semAcentos(busca);
    return (lista || []).filter((c) => {
      if (soAtivos && !c.ativo) return false;
      return (
        !filtro ||
        semAcentos(c.nome).includes(filtro) ||
        semAcentos(c.codigo).includes(filtro) ||
        semAcentos(c.categoria).includes(filtro)
      );
    });
  }, [lista, busca, soAtivos]);

  const abrirNova = () => {
    setForm({ codigo: "", nome: "", contacto: "", categoria: "", area: "Outros", grupo: "", ordem: "999" });
    setDialog("nova");
  };

  const abrirEdicao = (c: EscColab) => {
    setForm({
      codigo: c.codigo,
      nome: c.nome,
      contacto: c.contacto || "",
      categoria: c.categoria || "",
      area: c.area || "Outros",
      grupo: c.grupo || "",
      ordem: String(c.ordem ?? 999)
    });
    setDialog(c);
  };

  const gravar = async () => {
    const problema = problemaColab({
      codigo: form.codigo,
      nome: form.nome,
      contacto: form.contacto,
      categoria: form.categoria,
      area: form.area,
      grupo: form.grupo || null,
      ordem: form.ordem
    });
    if (problema) {
      toast.error(problema);
      return;
    }
    setOcupado(true);
    try {
      if (dialog === "nova") {
        await enviar("/api/escalas/colaboradores", { ...form, grupo: form.grupo || null }, "Pessoa criada.");
      } else if (dialog) {
        await enviar(
          "/api/escalas/colaboradores",
          { id: dialog.id, ...form, grupo: form.grupo || null },
          "Pessoa actualizada.",
          "PATCH"
        );
      }
      setDialog(null);
      setLista(await carregar());
    } catch {
      // o enviar já mostra o erro
    } finally {
      setOcupado(false);
    }
  };

  const alternarAtivo = async (c: EscColab) => {
    setOcupado(true);
    try {
      await enviar(
        "/api/escalas/colaboradores",
        { id: c.id, ativo: !c.ativo },
        c.ativo ? "Pessoa desactivada." : "Pessoa activada.",
        "PATCH"
      );
      setLista(await carregar());
    } catch {
      // o enviar já mostra o erro
    } finally {
      setOcupado(false);
    }
  };

  if (falha) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{falha}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Cabeca titulo="Colaboradores da Escala" subtitulo="Registo com contactos, áreas e grupos de turno">
        {podeMexer ? (
          <Button size="sm" onClick={abrirNova}>
            <Plus className="size-4" aria-hidden /> Nova pessoa
          </Button>
        ) : null}
      </Cabeca>

      <Card>
        <CardContent className="p-4" data-registo-escalas>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input
              className="h-9 w-56"
              placeholder="Buscar nome, código ou categoria"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar"
            />
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input type="checkbox" checked={soAtivos} onChange={(e) => setSoAtivos(e.target.checked)} />
              só activos
            </label>
            <span className="ml-auto text-xs text-muted-foreground">{gente.length} pessoas</span>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1">Código</th>
                  <th className="py-1">Nome</th>
                  <th className="py-1">Contacto</th>
                  <th className="py-1">Categoria</th>
                  <th className="py-1">Área</th>
                  <th className="py-1">Grupo</th>
                  <th className="py-1">Ordem</th>
                  {podeMexer ? <th className="py-1 text-right">Acções</th> : null}
                </tr>
              </thead>
              <tbody>
                {gente.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="py-1.5 font-semibold">{c.codigo}</td>
                    <td className="py-1.5">
                      {c.nome}
                      {!c.ativo ? (
                        <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[0.6rem]">inactiva</span>
                      ) : null}
                    </td>
                    <td className="py-1.5 text-muted-foreground">{c.contacto || "-"}</td>
                    <td className="py-1.5 text-xs text-muted-foreground">{c.categoria || "-"}</td>
                    <td className="py-1.5 text-xs">{c.area}</td>
                    <td className="py-1.5 font-bold text-sky-600 dark:text-sky-400">{c.grupo || "-"}</td>
                    <td className="py-1.5 tabular-nums text-muted-foreground">{c.ordem}</td>
                    {podeMexer ? (
                      <td className="py-1.5 text-right">
                        <Button size="sm" variant="outline" onClick={() => abrirEdicao(c)}>
                          Editar
                        </Button>
                        {podeApagar ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-1 text-destructive"
                            onClick={() => void alternarAtivo(c)}
                          >
                            {c.ativo ? "Desactivar" : "Activar"}
                          </Button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDialog(null)}>
          <div
            className="max-h-[90vh] w-full max-w-md overflow-auto rounded-xl border bg-card p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={dialog === "nova" ? "Nova pessoa" : "Editar pessoa"}
          >
            <h3 className="mb-2 text-base font-bold">{dialog === "nova" ? "Nova pessoa" : form.nome}</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <label className="text-xs font-semibold">Código</label>
                <Input className="mt-1" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold">Contacto</label>
                <Input className="mt-1" value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold">Nome</label>
                <Input className="mt-1" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold">Categoria</label>
                <Input
                  className="mt-1"
                  value={form.categoria}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                  placeholder="Ex.: Mecanico - Grupo A - C.T."
                />
              </div>
              <div>
                <label className="text-xs font-semibold">Área</label>
                <select
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2"
                  value={form.area}
                  onChange={(e) => setForm({ ...form, area: e.target.value })}
                >
                  {AREAS_ESCALA.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold">Grupo de turno</label>
                <select
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2"
                  value={form.grupo}
                  onChange={(e) => setForm({ ...form, grupo: e.target.value })}
                >
                  <option value="">(sem grupo)</option>
                  {["A", "B", "C", "D"].map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold">Ordem</label>
                <Input className="mt-1" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: e.target.value })} />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDialog(null)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={gravar} disabled={ocupado}>
                {ocupado ? <Rodar /> : null} Gravar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
