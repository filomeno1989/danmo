/**
 * Prova da ponte Ordens -> Disponibilidade com os dados REAIS da base.
 * Corre com: bun scripts/prova_ponte.ts (dentro de /home/z/my-project/danmo)
 */
import { queryTudo } from "../src/lib/supabase";
import {
  paradasDeHoje,
  segmentosDeOrdens,
  segmentosDeTransicoes,
  sintetizarDias,
  diasDoMes,
  type OrdemPonte
} from "../src/lib/ponte-os";
import { hojeMaputo } from "../src/lib/disponibilidade";

const MES = process.argv[2] || "2026-10";

type Equip = { id: number; code: string; name: string | null; group_name: string | null; active: boolean };
type Dia = { equipment_id: number; data: string; estado: string | null; horas_disponiveis: number | string | null };
type OS = {
  id: number;
  numero_obra: string | null;
  equipment_id: number;
  data_abertura: string | null;
  data_fecho: string | null;
  status_atual: string;
  status_fisico: string | null;
  atualizado_em: string | null;
};
type Log = { os_id: number; data_mudanca: string };

async function main() {
  const [ano, mes] = MES.split("-").map(Number);
  const fimExclusivo = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
  const hoje = hojeMaputo();

  const [equipamentos, dias, transicoesAbertas, ordensBrutas] = await Promise.all([
    queryTudo<Equip>("equipment", "select=id,code,name,group_name,active&order=code.asc"),
    queryTudo<Dia>("disp_dias", `select=equipment_id,data,estado,horas_disponiveis&data=gte.${MES}-01&data=lt.${fimExclusivo}`),
    queryTudo<{ id: number; equipment_id: number; estado: string; inicio: string; fim: string | null }>(
      "disp_transicoes",
      "select=id,equipment_id,estado,inicio,fim&fim=is.null"
    ),
    queryTudo<OS>(
      "ordens_servico",
      `select=id,numero_obra,equipment_id,data_abertura,data_fecho,status_atual,status_fisico,atualizado_em&data_abertura=lte.${fimExclusivo}`
    )
  ]);

  const idsCdm = ordensBrutas.filter((o) => o.status_atual === "CdM" && !o.data_fecho).map((o) => o.id);
  const logs = idsCdm.length
    ? await queryTudo<Log>(
        "os_status_log",
        `select=os_id,data_mudanca&status_novo=eq.CdM&os_id=in.(${idsCdm.join(",")})&order=data_mudanca.asc`
      )
    : [];
  const saidaCdM = new Map<number, string>();
  for (const l of logs) {
    const d = (l.data_mudanca || "").slice(0, 10);
    if (d && d > (saidaCdM.get(l.os_id) || "")) saidaCdM.set(l.os_id, d);
  }

  const ordensPonte: OrdemPonte[] = ordensBrutas.map((o) => ({
    id: o.id,
    numero_obra: o.numero_obra || null,
    equipment_id: o.equipment_id,
    data_abertura: o.data_abertura || null,
    status_atual: o.status_atual,
    status_fisico: o.status_fisico || null,
    saida:
      o.status_atual === "Fechada" || o.status_atual === "CdM"
        ? (o.data_fecho || "").slice(0, 10) || saidaCdM.get(o.id) || (o.atualizado_em || "").slice(0, 10) || null
        : null
  }));

  const segmentos = [
    ...segmentosDeOrdens(ordensPonte),
    ...segmentosDeTransicoes(transicoesAbertas, hoje)
  ];

  const chavesExplicitas = new Set(dias.map((d) => `${d.equipment_id}|${d.data.slice(0, 10)}`));
  const sintetizados = sintetizarDias({ mes: MES, equipamentos, chavesExplicitas, segmentos });
  const nomes = new Map(equipamentos.map((e) => [e.id, { code: e.code, nome: e.name || "" }]));
  const paradas = paradasDeHoje(segmentos, hoje, nomes);

  console.log(`=== PONTE OS -> DISPONIBILIDADE : ${MES} ===`);
  console.log(`Máquinas: ${equipamentos.length} (${equipamentos.filter((e) => e.active).length} activas)`);
  console.log(`Dias explícitos na BD: ${dias.length}`);
  console.log(`Dias sintetizados: ${sintetizados.length}`);
  const porOrigem: Record<string, number> = {};
  const porEstado: Record<string, number> = {};
  for (const s of sintetizados) {
    porOrigem[s.origem] = (porOrigem[s.origem] || 0) + 1;
    porEstado[s.estado] = (porEstado[s.estado] || 0) + 1;
  }
  console.log("Síntese por origem:", porOrigem);
  console.log("Síntese por estado:", porEstado);

  // Ordens ainda na oficina que estão a parar máquinas neste mês
  const abertas = ordensPonte.filter((o) => !o.saida);
  console.log(`\nOrdens ainda na oficina (parada desde a abertura): ${abertas.length}`);
  const diasOrdem = sintetizados.filter((s) => s.origem === "ordem");
  const maquinasOrdem = new Set(diasOrdem.map((s) => s.equipment_id));
  console.log(`Máquinas com dias parados por obra: ${maquinasOrdem.size}`);

  // Prova 1: uma obra aberta (mais antiga) deve estar parada desde a abertura
  const maisAntiga = abertas.filter((o) => o.data_abertura).sort((a, b) => (a.data_abertura! < b.data_abertura! ? -1 : 1))[0];
  if (maisAntiga) {
    const eq = nomes.get(maisAntiga.equipment_id);
    const doDia = sintetizados.filter((s) => s.equipment_id === maisAntiga.equipment_id);
    const parados = doDia.filter((s) => s.origem === "ordem");
    console.log(
      `\nPROVA 1 - obra ${maisAntiga.numero_obra || maisAntiga.id} (máq ${eq?.code}, abertura ${maisAntiga.data_abertura?.slice(0, 10)}, ${maisAntiga.status_fisico}):`
    );
    console.log(`  dias sintetizados como ordem: ${parados.length}`);
    const primeiro = parados[0];
    const ultimo = parados[parados.length - 1];
    console.log(`  primeiro: ${primeiro?.data} (${primeiro?.estado})  último: ${ultimo?.data} (${ultimo?.estado})`);
    const esperadoDesde = maisAntiga.data_abertura!.slice(0, 10);
    console.log(`  começa na abertura? ${primeiro?.data === esperadoDesde ? "SIM" : "NAO (" + primeiro?.data + ")"}`);
  }

  // Prova 2: uma obra em CdM deve voltar disponível no dia da saída
  const cdmRecente = ordensPonte
    .filter((o) => o.status_atual === "CdM" && o.saida && o.saida >= `${MES}-01` && o.data_abertura && o.data_abertura <= `${MES}-31`)
    .sort((a, b) => (b.saida! < a.saida! ? 1 : -1))[0];
  if (cdmRecente) {
    const eq = nomes.get(cdmRecente.equipment_id);
    const diasMaq = new Map(sintetizados.filter((s) => s.equipment_id === cdmRecente.equipment_id).map((s) => [s.data, s]));
    const ultimaParada = cdmRecente.saida === `${MES}-01` ? null : diasDoMes(MES).filter((d) => d < cdmRecente.saida!).pop();
    const noDiaSaida = diasMaq.get(cdmRecente.saida!);
    console.log(
      `\nPROVA 2 - obra ${cdmRecente.numero_obra || cdmRecente.id} (máq ${eq?.code}) enviada à CdM em ${cdmRecente.saida}:`
    );
    console.log(`  último dia parado: ${ultimaParada ?? "(nenhum neste mês)"} -> estado ${ultimaParada ? diasMaq.get(ultimaParada)?.estado + "/" + diasMaq.get(ultimaParada)?.origem : "-"}`);
    console.log(`  no dia da saída: ${noDiaSaida?.estado} (${noDiaSaida?.origem}) -> ${noDiaSaida?.estado === "Disponível" ? "SIM, voltou" : "NAO"}`);
  }

  // Prova 3: mês importado (2025-10) não é tocado
  if (MES !== "2026-10") {
    console.log("\n(mês não é Out 2026: prova 3 ignorada aqui; correr com 2026-10)");
  }

  console.log(`\nParadas neste momento: ${paradas.length} máquinas`);
  console.log(
    paradas
      .slice(0, 8)
      .map((p) => `  ${p.code} ${p.nome} · ${p.estado}${p.obra ? ` · Obra ${p.obra}` : ""}`)
      .join("\n")
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("ERRO:", e);
    process.exit(1);
  });
