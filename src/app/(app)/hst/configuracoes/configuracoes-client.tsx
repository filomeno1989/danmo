/**
 * /hst/configuracoes - Configuração (cliente).
 *
 * Contagens, próxima numeração (regra do servidor provada na lib),
 * backup JSON das 6 tabelas e a zona de perigo (limpeza total com
 * dupla confirmação + palavra APAGAR, só para quem pode apagar).
 */

"use client";

import { useEffect, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { numeroFmtHst, proximoNumeroHst } from "@/lib/hst";

type Contagens = Record<string, number>;

const NOMES_TABELAS: [string, string][] = [
  ["hst_areas_risco", "Áreas de Risco"],
  ["hst_epis", "Tipos de EPIs"],
  ["hst_epi_entregas", "Entregas de EPIs"],
  ["hst_acidentes", "Acidentes / Incidentes"],
  ["hst_acoes_corretivas", "Acções Correctivas"],
  ["hst_medicoes_tensao", "Medições de Tensão"]
];

export function ConfiguracoesClient({ podeApagar }: { podeApagar: boolean }) {
  const [contagens, setContagens] = useState<Contagens | null>(null);
  const [falha, setFalha] = useState("");
  const [proximo, setProximo] = useState<number | null>(null);
  const [aExportar, setAExportar] = useState(false);

  // Zona de perigo
  const [modalLimpeza, setModalLimpeza] = useState(false);
  const [palavra, setPalavra] = useState("");
  const [aLimpar, setALimpar] = useState(false);

  useEffect(() => {
    // As contagens vêm das próprias listas: uma leitura só por fonte de dados.
    Promise.all([
      pedir<{ acidentes: unknown[]; acoes?: unknown[] }>("/api/hst/acidentes"),
      pedir<{ epis: unknown[]; entregas: unknown[] }>("/api/hst/epis"),
      pedir<{ medicoes: unknown[] }>("/api/hst/medicoes"),
      pedir<{ areas: unknown[] }>("/api/hst/areas")
    ])
      .then(([acc, epi, med, are]) => {
        setContagens({
          hst_acidentes: acc.acidentes.length,
          hst_acoes_corretivas: acc.acoes?.length || 0,
          hst_epis: epi.epis.length,
          hst_epi_entregas: epi.entregas.length,
          hst_medicoes_tensao: med.medicoes.length,
          hst_areas_risco: are.areas.length
        });
      })
      .catch((e: Error) => setFalha(e.message));
  }, []);

  // A numeração verdadeira precisa do maior número do ano; pede-se à lista.
  useEffect(() => {
    pedir<{ acidentes: { numero: string | null }[] }>("/api/hst/acidentes")
      .then((d) => {
        const ano = new Date().getFullYear();
        const prefixo = `DAN-HST-${ano}-`;
        const maior = Math.max(
          0,
          ...d.acidentes
            .map((a) => ((a.numero || "").startsWith(prefixo) ? Number((a.numero || "").slice(prefixo.length)) : 0))
            .filter((n) => Number.isFinite(n))
        );
        setProximo(proximoNumeroHst(ano, maior));
      })
      .catch(() => {});
  }, []);

  async function exportarJson() {
    setAExportar(true);
    try {
      const [acc, epi, med, are] = await Promise.all([
        pedir<Record<string, unknown>>("/api/hst/acidentes"),
        pedir<Record<string, unknown>>("/api/hst/epis"),
        pedir<Record<string, unknown>>("/api/hst/medicoes"),
        pedir<Record<string, unknown>>("/api/hst/areas")
      ]);
      const dados = {
        modulo: "HST",
        exportado_em: new Date().toISOString(),
        hst_acidentes: acc.acidentes,
        hst_acoes_corretivas: acc.acoes,
        hst_epis: epi.epis,
        hst_epi_entregas: epi.entregas,
        hst_medicoes_tensao: med.medicoes,
        hst_areas_risco: are.areas
      };
      const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `danmo_hst_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup JSON descarregado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar.");
    } finally {
      setAExportar(false);
    }
  }

  async function limparTudo() {
    if (palavra !== "APAGAR") {
      toast.warning("Escreve APAGAR para confirmar.");
      return;
    }
    setALimpar(true);
    try {
      await enviar("/api/hst/limpeza", { confirmar: palavra }, "Todos os dados HST foram apagados.");
      setModalLimpeza(false);
      setPalavra("");
    } catch {
      /* toast já avisou */
    } finally {
      setALimpar(false);
    }
  }

  if (falha) {
    return <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">{falha}</div>;
  }

  return (
    <div className="space-y-5">
      <Cabeca titulo="Configuração HST" subtitulo="Definições e manutenção do Portal HST" />

      {/* Numeração */}
      <Card className="card-sombra">
        <CardContent className="p-5">
          <h2 className="mb-2 text-sm font-bold">Numeração automática dos relatórios de acidente</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Formato <strong>DAN-HST-AAAA-NNN</strong>, reinicia a cada ano e é calculado no SERVIDOR
            quando gravas: o número de baixo é só a pré-visualização do próximo.
          </p>
          <Input readOnly value={proximo != null ? numeroFmtHst(new Date().getFullYear(), proximo) : "A calcular..."}
            className="max-w-56 font-bold" aria-label="Próximo número" />
        </CardContent>
      </Card>

      {/* Contadores */}
      <Card className="card-sombra">
        <CardContent className="p-5">
          <h2 className="mb-3 text-sm font-bold">Contadores e estatísticas</h2>
          {!contagens ? (
            <p className="text-sm text-muted-foreground">A calcular...</p>
          ) : (
            <div className="divide-y divide-border">
              {NOMES_TABELAS.map(([tabela, nome]) => (
                <div key={tabela} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-muted-foreground">{nome}</span>
                  <span className="font-bold">{contagens[tabela] ?? 0} registo(s)</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Backup */}
      <Card className="card-sombra">
        <CardContent className="p-5">
          <h2 className="mb-2 text-sm font-bold">Backup completo (JSON)</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Descarrega as 6 tabelas HST num ficheiro JSON com data e hora. Guarda-o fora do portal
            antes de qualquer manutenção grande.
          </p>
          <Button variant="outline" onClick={exportarJson} disabled={aExportar}>
            {aExportar ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
            Exportar Dados (JSON)
          </Button>
        </CardContent>
      </Card>

      {/* Zona de perigo */}
      <Card className="card-sombra border-red-500/50">
        <CardContent className="p-5">
          <h2 className="mb-2 text-sm font-bold text-red-600">Zona de Perigo</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            A limpeza total apaga TODOS os registos das 6 tabelas HST (áreas, EPIs, entregas,
            acidentes, acções e medições). Não pode ser desfeita. Faz o backup JSON antes.
          </p>
          {podeApagar ? (
            <Button variant="destructive" onClick={() => setModalLimpeza(true)}>
              Limpar Todos os Dados HST
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Só quem tem permissão de apagar nas Configurações HST executa a limpeza.
            </p>
          )}
        </CardContent>
      </Card>

      <Modal aberto={modalLimpeza} fechar={() => setModalLimpeza(false)} titulo="Limpeza total dos dados HST" largura="max-w-md">
        <div className="space-y-3">
          <p className="text-sm">
            1a confirmação: isto vai <strong>APAGAR TODOS os dados</strong> das 6 tabelas HST
            (áreas de risco, EPIs, entregas, acidentes, acções correctivas e medições de tensão).
            Não pode ser desfeito.
          </p>
          <p className="text-sm font-semibold text-red-600">
            2a confirmação: escreve APAGAR na caixa abaixo para destravar o botão.
          </p>
          <Input value={palavra} onChange={(e) => setPalavra(e.target.value)} placeholder="APAGAR" aria-label="Palavra de confirmação" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalLimpeza(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={limparTudo} disabled={aLimpar || palavra !== "APAGAR"}>
              {aLimpar ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Apagar definitivamente
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
