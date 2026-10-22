"use client";

/**
 * editor-tabelas.tsx - Peças do editor: campos, toggles e as três
 * tabelas de itens (Mão-de-Obra, Material, Misto) com os atalhos de
 * tarifa, select de materiais e a marca "Do cliente" (material não
 * faturado, sai no Anexo de Material).
 */

import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fmtNum, type TarifaFat, type TecnicoFat } from "@/lib/faturacao";
import type { Linha, MaterialLinha } from "./editor-tipos";

export type DadosTabelas = {
  tecnicos: TecnicoFat[];
  tarifas: TarifaFat[];
  materiais: MaterialLinha[];
};

/* ============ Campo com rótulo ============ */

export function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </p>
      {children}
    </div>
  );
}

/* ============ Toggle de opções ============ */

export function Toggle({
  valor,
  opcoes,
  onChange
}: {
  valor: string;
  opcoes: { v: string; t: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-border">
      {opcoes.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "px-3 py-1.5 text-sm transition-colors",
            valor === o.v
              ? "bg-ambar-texto text-white dark:bg-amber-500 dark:text-black"
              : "bg-background text-muted-foreground hover:bg-muted"
          )}
        >
          {o.t}
        </button>
      ))}
    </div>
  );
}

/* ============ Select de unidade (com "Outro...") ============ */

function SelectUnidade({
  valor,
  onChange,
  onOutro
}: {
  valor: string;
  onChange: (v: string) => void;
  onOutro: (sel: HTMLSelectElement) => void;
}) {
  const conhecida = (UNIDADES_LISTA as readonly string[]).includes(valor);
  return (
    <select
      value={conhecida ? valor : "__outro__"}
      onChange={(e) => {
        if (e.target.value === "__outro__") onOutro(e.target);
        else onChange(e.target.value);
      }}
      className="h-8 w-full rounded-md border border-input bg-background px-1.5 text-xs"
    >
      {UNIDADES_LISTA.map((u) => (
        <option key={u} value={u}>{u}</option>
      ))}
      <option value="__outro__">Outro...</option>
    </select>
  );
}

const UNIDADES_LISTA = [
  "horas", "hora", "dias", "Und", "Litro", "Kg",
  "Metro", "Par", "Caixa", "Rolo", "Tonelada", "m²", "ml"
];

/* ============ Marca "Do cliente" ============ */

function MarcaCliente({ activo }: { activo: boolean }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[0.7rem] font-semibold">
      <input
        type="checkbox"
        checked={activo}
        onChange={() => {}}
        className="size-3.5 accent-amber-600"
      />
      <span className={activo ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
        Do cliente
      </span>
    </label>
  );
}

/* ============ Tabela Mão-de-Obra ============ */

export function TabelaMao({
  itens,
  dados,
  moeda,
  onEditar,
  onApagar,
  onTecnico,
  onTarifa,
  onUnidadeOutro
}: {
  itens: Linha[];
  dados: DadosTabelas;
  moeda: string;
  onEditar: (id: string, campo: keyof Linha, valor: string | number) => void;
  onApagar: (id: string) => void;
  onTecnico: (id: string, tecnicoId: string) => void;
  onTarifa: (id: string, valor: number) => void;
  onUnidadeOutro: (id: string, sel: HTMLSelectElement) => void;
}) {
  return (
    <TabelaWrap
      minW={640}
      cabecalho={
        <tr className="border-b bg-ambar-claro/50 text-left text-[0.65rem] uppercase tracking-wider text-ambar-texto dark:text-amber-400">
          <Th className="w-8">#</Th>
          <Th>Técnico</Th>
          <Th className="w-14">Qtd</Th>
          <Th className="w-16">Tempo</Th>
          <Th className="w-24">Unidade</Th>
          <Th className="w-[120px]">Val. Unit. ({moeda})</Th>
          <Th className="w-[110px] text-right">Total ({moeda})</Th>
          <Th className="w-8"></Th>
        </tr>
      }
    >
      {itens.map((l, idx) => (
        <tr key={l._id} className="border-b border-border/50">
          <Td className="text-xs text-muted-foreground">{idx + 1}</Td>
          <Td>
            <select
              value={l.tecnico_id}
              onChange={(e) => onTecnico(l._id, e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-1.5 text-xs"
            >
              <option value="">- Técnico -</option>
              {dados.tecnicos.filter((t) => t.ativo !== false).map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </Td>
          <Td>
            <Input
              type="number"
              className="h-8 w-full px-1.5 text-xs"
              value={l.qtd}
              min="1"
              onChange={(e) => onEditar(l._id, "qtd", e.target.value)}
            />
          </Td>
          <Td>
            <Input
              type="number"
              className="h-8 w-full px-1.5 text-xs"
              value={l.tempo}
              min="0.5"
              step="0.5"
              onChange={(e) => onEditar(l._id, "tempo", e.target.value)}
            />
          </Td>
          <Td>
            <SelectUnidade
              valor={l.unidade}
              onChange={(v) => onEditar(l._id, "unidade", v)}
              onOutro={(sel) => onUnidadeOutro(l._id, sel)}
            />
          </Td>
          <Td>
            <Input
              type="number"
              className="h-8 w-full px-1.5 text-xs"
              value={l.valor_unit}
              step="0.01"
              onChange={(e) => onEditar(l._id, "valor_unit", e.target.value)}
            />
            <div className="mt-1 flex flex-wrap gap-1">
              {dados.tarifas.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  title={t.descricao}
                  onClick={() => onTarifa(l._id, Number(t.valor_mzn) || 0)}
                  className="rounded border border-ambar-texto/30 bg-ambar-claro px-1.5 py-0.5 text-[0.65rem] font-semibold text-ambar-texto hover:bg-ambar-texto hover:text-white dark:text-amber-400 dark:hover:text-black"
                >
                  {fmtNum(Number(t.valor_mzn) || 0)}
                </button>
              ))}
            </div>
          </Td>
          <Td className="text-right font-mono text-xs font-bold text-ambar-texto dark:text-amber-400">
            {fmtNum(totalLinhaMao(l))}
          </Td>
          <Td><BotaoApagar onClick={() => onApagar(l._id)} /></Td>
        </tr>
      ))}
    </TabelaWrap>
  );
}

const totalLinhaMao = (l: Linha) =>
  (Number(l.qtd) || 0) * (Number(l.tempo) || 0) * (Number(l.valor_unit) || 0);

/* ============ Tabela Material ============ */

export function TabelaMaterial({
  itens,
  dados,
  moeda,
  onEditar,
  onApagar,
  onMaterial,
  onAlternarCliente,
  onUnidadeOutro
}: {
  itens: Linha[];
  dados: DadosTabelas;
  moeda: string;
  onEditar: (id: string, campo: keyof Linha, valor: string | number) => void;
  onApagar: (id: string) => void;
  onMaterial: (id: string, materialId: string) => void;
  onAlternarCliente: (id: string) => void;
  onUnidadeOutro: (id: string, sel: HTMLSelectElement) => void;
}) {
  return (
    <TabelaWrap
      minW={640}
      cabecalho={
        <tr className="border-b bg-ambar-claro/50 text-left text-[0.65rem] uppercase tracking-wider text-ambar-texto dark:text-amber-400">
          <Th className="w-8">#</Th>
          <Th>Descrição</Th>
          <Th className="w-14">Qtd</Th>
          <Th className="w-24">Unidade</Th>
          <Th className="w-[110px]">Val. Unit. ({moeda})</Th>
          <Th className="w-[100px] text-right">Total ({moeda})</Th>
          <Th className="w-20"></Th>
        </tr>
      }
    >
      {itens.map((l, idx) => {
        const doCliente = l.item_tipo === "material_cliente";
        return (
          <tr
            key={l._id}
            className={cn(
              "border-b border-border/50",
              doCliente && "bg-amber-500/5"
            )}
          >
            <Td className="text-xs text-muted-foreground">{idx + 1}</Td>
            <Td>
              <select
                value=""
                onChange={(e) => onMaterial(l._id, e.target.value)}
                className="mb-1 h-8 w-full rounded-md border border-input bg-background px-1.5 text-xs"
              >
                <option value="">- Selecionar material do stock -</option>
                {dados.materiais.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.referencia ? `${m.referencia} - ` : ""}{m.nome}
                  </option>
                ))}
              </select>
              <Input
                className="h-8 w-full px-1.5 text-xs"
                value={l.descricao}
                placeholder="Ou escrever manualmente"
                onChange={(e) => onEditar(l._id, "descricao", e.target.value)}
              />
            </Td>
            <Td>
              <Input
                type="number"
                className="h-8 w-full px-1.5 text-xs"
                value={l.qtd}
                min="1"
                onChange={(e) => onEditar(l._id, "qtd", e.target.value)}
              />
            </Td>
            <Td>
              <SelectUnidade
                valor={l.unidade}
                onChange={(v) => onEditar(l._id, "unidade", v)}
                onOutro={(sel) => onUnidadeOutro(l._id, sel)}
              />
            </Td>
            <Td>
              <Input
                type="number"
                className="h-8 w-full px-1.5 text-xs"
                value={doCliente ? 0 : l.valor_unit}
                step="0.01"
                disabled={doCliente}
                onChange={(e) => onEditar(l._id, "valor_unit", e.target.value)}
              />
              <div className="mt-1">
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-[0.7rem] font-semibold">
                  <input
                    type="checkbox"
                    checked={doCliente}
                    onChange={() => onAlternarCliente(l._id)}
                    className="size-3.5 accent-amber-600"
                  />
                  <span className={doCliente ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                    Do cliente
                  </span>
                </label>
              </div>
            </Td>
            <Td className="text-right font-mono text-xs font-bold">
              {doCliente ? (
                <span className="italic text-amber-600 dark:text-amber-400">não faturado</span>
              ) : (
                <span className="text-ambar-texto dark:text-amber-400">
                  {fmtNum((Number(l.qtd) || 0) * (Number(l.valor_unit) || 0))}
                </span>
              )}
            </Td>
            <Td><BotaoApagar onClick={() => onApagar(l._id)} /></Td>
          </tr>
        );
      })}
    </TabelaWrap>
  );
}

/* ============ Tabela Misto ============ */

export function TabelaMisto({
  itens,
  dados,
  moeda,
  onEditar,
  onApagar,
  onTecnico,
  onMaterial,
  onTipo,
  onTarifa,
  onAlternarCliente,
  onUnidadeOutro
}: {
  itens: Linha[];
  dados: DadosTabelas;
  moeda: string;
  onEditar: (id: string, campo: keyof Linha, valor: string | number) => void;
  onApagar: (id: string) => void;
  onTecnico: (id: string, tecnicoId: string) => void;
  onMaterial: (id: string, materialId: string) => void;
  onTipo: (id: string, tipo: Linha["item_tipo"]) => void;
  onTarifa: (id: string, valor: number) => void;
  onAlternarCliente: (id: string) => void;
  onUnidadeOutro: (id: string, sel: HTMLSelectElement) => void;
}) {
  return (
    <TabelaWrap
      minW={760}
      cabecalho={
        <tr className="border-b bg-ambar-claro/50 text-left text-[0.65rem] uppercase tracking-wider text-ambar-texto dark:text-amber-400">
          <Th className="w-8">#</Th>
          <Th className="w-[92px]">Tipo</Th>
          <Th>Técnico / Descrição</Th>
          <Th className="w-14">Qtd</Th>
          <Th className="w-16">Tempo</Th>
          <Th className="w-24">Unidade</Th>
          <Th className="w-[110px]">Val. Unit. ({moeda})</Th>
          <Th className="w-[100px] text-right">Total ({moeda})</Th>
          <Th className="w-8"></Th>
        </tr>
      }
    >
      {itens.map((l, idx) => {
        const eMao = l.item_tipo === "mao";
        const doCliente = l.item_tipo === "material_cliente";
        return (
          <tr
            key={l._id}
            className={cn("border-b border-border/50", doCliente && "bg-amber-500/5")}
          >
            <Td className="text-xs text-muted-foreground">{idx + 1}</Td>
            <Td>
              <select
                value={eMao ? "mao" : "material"}
                onChange={(e) => onTipo(l._id, e.target.value as Linha["item_tipo"])}
                className="h-8 w-full rounded-md border border-input bg-background px-1.5 text-xs"
              >
                <option value="mao">M-de-O</option>
                <option value="material">Material</option>
              </select>
            </Td>
            <Td>
              {eMao ? (
                <select
                  value={l.tecnico_id}
                  onChange={(e) => onTecnico(l._id, e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-1.5 text-xs"
                >
                  <option value="">- Técnico -</option>
                  {dados.tecnicos.filter((t) => t.ativo !== false).map((t) => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
              ) : (
                <div>
                  <select
                    value=""
                    onChange={(e) => onMaterial(l._id, e.target.value)}
                    className="mb-1 h-8 w-full rounded-md border border-input bg-background px-1.5 text-xs"
                  >
                    <option value="">- Selecionar material do stock -</option>
                    {dados.materiais.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.referencia ? `${m.referencia} - ` : ""}{m.nome}
                      </option>
                    ))}
                  </select>
                  <Input
                    className="h-8 w-full px-1.5 text-xs"
                    value={l.descricao}
                    placeholder="Ou escrever manualmente"
                    onChange={(e) => onEditar(l._id, "descricao", e.target.value)}
                  />
                </div>
              )}
            </Td>
            <Td>
              <Input
                type="number"
                className="h-8 w-full px-1.5 text-xs"
                value={l.qtd}
                min="1"
                onChange={(e) => onEditar(l._id, "qtd", e.target.value)}
              />
            </Td>
            <Td>
              {eMao ? (
                <Input
                  type="number"
                  className="h-8 w-full px-1.5 text-xs"
                  value={l.tempo}
                  step="0.5"
                  onChange={(e) => onEditar(l._id, "tempo", e.target.value)}
                />
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </Td>
            <Td>
              <SelectUnidade
                valor={l.unidade}
                onChange={(v) => onEditar(l._id, "unidade", v)}
                onOutro={(sel) => onUnidadeOutro(l._id, sel)}
              />
            </Td>
            <Td>
              <Input
                type="number"
                className="h-8 w-full px-1.5 text-xs"
                value={doCliente ? 0 : l.valor_unit}
                step="0.01"
                disabled={doCliente}
                onChange={(e) => onEditar(l._id, "valor_unit", e.target.value)}
              />
              {eMao ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {dados.tarifas.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      title={t.descricao}
                      onClick={() => onTarifa(l._id, Number(t.valor_mzn) || 0)}
                      className="rounded border border-ambar-texto/30 bg-ambar-claro px-1.5 py-0.5 text-[0.65rem] font-semibold text-ambar-texto hover:bg-ambar-texto hover:text-white dark:text-amber-400 dark:hover:text-black"
                    >
                      {fmtNum(Number(t.valor_mzn) || 0)}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-1">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-[0.7rem] font-semibold">
                    <input
                      type="checkbox"
                      checked={doCliente}
                      onChange={() => onAlternarCliente(l._id)}
                      className="size-3.5 accent-amber-600"
                    />
                    <span className={doCliente ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                      Do cliente
                    </span>
                  </label>
                </div>
              )}
            </Td>
            <Td className="text-right font-mono text-xs font-bold">
              {doCliente ? (
                <span className="italic text-amber-600 dark:text-amber-400">não faturado</span>
              ) : (
                <span className="text-ambar-texto dark:text-amber-400">
                  {fmtNum(eMao ? totalLinhaMao(l) : (Number(l.qtd) || 0) * (Number(l.valor_unit) || 0))}
                </span>
              )}
            </Td>
            <Td><BotaoApagar onClick={() => onApagar(l._id)} /></Td>
          </tr>
        );
      })}
    </TabelaWrap>
  );
}

export { MarcaCliente };

/* ============ Peças comuns ============ */

/**
 * Grelha comum às três tabelas.
 *
 * O cabeçalho JÁ CHEGA como <tr> único e entra directo no <thead>:
 * encaixar <tr> dentro de <tr> é HTML inválido - o navegador içava as
 * células para fora da grelha e o cabeçalho ficava com larguras próprias,
 * desalinhado dos registos.
 *
 * table-fixed + larguras declaradas nos <th> + campos w-full nas células:
 * cabeçalho e linhas partilham a MESMA grelha por construção, em qualquer
 * ecrã. minW por tabela deixa a Misto (9 colunas) rolar no ecrã estreito
 * sem espremer as colunas fixas.
 */
function TabelaWrap({
  cabecalho,
  children,
  minW = 560
}: {
  cabecalho: React.ReactNode;
  children: React.ReactNode;
  minW?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed text-sm" style={{ minWidth: `${minW}px` }}>
        <thead>{cabecalho}</thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("px-2 py-2 font-semibold", className)}>{children}</th>;
}

function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-2 py-1.5 align-middle", className)}>{children}</td>;
}

function BotaoApagar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Remover linha"
      className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}
