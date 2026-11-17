/**
 * Provas do IMPORTADOR do Excel da escala (leitor do ficheiro real).
 *
 * Lê o ESCALA MENSAL 2026.xlsx da raiz do projeto (o mesmo que o
 * Filomeno usa) e prova: o registo (117 pessoas com código, contacto,
 * área e grupo deduzidos), as grelhas dos 11 meses, as folgas
 * guardadas trazidas do saldo Anterior, e os problemas explicados
 * (nomes aproximados Barreto/Sousa e os EST com sufixo único).
 *
 * Se o Excel não estiver na raiz (o Filomeno disse que o apaga depois
 * de a migração passar), a família salta-se a si mesma.
 */

import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import { lerEscalasDeBuffer, chaveNome } from "@/lib/escalas-import";

const CAMINHO = "ESCALA MENSAL 2026.xlsx";
const existe = fs.existsSync(CAMINHO);

function abrir(): NonNullable<ReturnType<typeof lerEscalasDeBuffer>> {
  const buf = fs.readFileSync(CAMINHO);
  return lerEscalasDeBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

describe.skipIf(!existe)("Importador do Excel mensal", () => {
  const dados = existe ? abrir() : null;

  test("registo: 117 pessoas com código único e contacto", () => {
    expect(dados!.colaboradores.length).toBe(117);
    const codigos = new Set(dados!.colaboradores.map((c) => c.codigo));
    expect(codigos.size).toBe(dados!.colaboradores.length);
    const comContacto = dados!.colaboradores.filter((c) => /^\d{7,15}$/.test(c.contacto));
    expect(comContacto.length).toBeGreaterThan(100);
  });

  test("os 3 supervisores estão no topo da área certa", () => {
    const sups = dados!.colaboradores.filter((c) => c.area === "Supervisores");
    expect(sups.length).toBe(3);
    expect(sups.map((s) => s.nome)).toContain("Mario Jose Guiliche");
    expect(sups.every((s) => s.codigo.startsWith("DM"))).toBe(true);
  });

  test("grupos de turno com A-D e chefes marcados", () => {
    const turnos = dados!.colaboradores.filter((c) => c.area === "Grupos de Turno");
    expect(turnos.length).toBe(18);
    const grupos = new Set(turnos.map((c) => c.grupo));
    expect(grupos).toEqual(new Set(["A", "B", "C", "D"]));
    expect(turnos.some((c) => c.categoria.includes("C.T."))).toBe(true);
  });

  test("áreas completas (a última folha manda nas categorias)", () => {
    const areas: Record<string, number> = {};
    for (const c of dados!.colaboradores) areas[c.area] = (areas[c.area] || 0) + 1;
    expect(areas["Supervisores"]).toBe(3);
    expect(areas["Grupos de Turno"]).toBe(18);
    expect(areas["Pneumáticos"]).toBe(10);
    expect(areas["Mecânica"]).toBe(36);
    expect(areas["Eléctrica"]).toBe(19);
    expect(areas["Serralharia"]).toBe(20);
  });

  test("11 meses de grelha (Janeiro a Novembro de 2026)", () => {
    expect(dados!.meses.length).toBe(11);
    expect(dados!.meses[0]).toMatchObject({ ano: 2026, mes: 1 });
    expect(dados!.meses[10]).toMatchObject({ ano: 2026, mes: 11 });
    const jan = dados!.meses[0].celulas;
    expect(jan.length).toBe(2685);
    // 1 de Janeiro é feriado: o supervisor eléctrico está marcado Sup.
    // nos dias 10 e 11 (fim de semana de supervisão, folha JAN)
    const celDM0026 = jan.filter((x) => x.codigo === "DM0026");
    expect(celDM0026.some((x) => x.data === "2026-01-01" && x.codigo_escala === "FRD")).toBe(true);
    expect(celDM0026.some((x) => x.data === "2026-01-10" && x.codigo_escala === "Sup.")).toBe(true);
    expect(celDM0026.some((x) => x.data === "2026-01-11" && x.codigo_escala === "Sup.")).toBe(true);
  });

  test("férias marcadas como LD no mês (Mussa em Janeiro de 2026)", () => {
    const jan = dados!.meses[0].celulas;
    const mussa = jan.filter((x) => x.codigo === "DM0240");
    expect(mussa.length).toBe(29);
    expect(mussa.every((x) => x.codigo_escala === "LD" || x.codigo_escala === "FRD" || x.codigo_escala === "Norm.")).toBe(true);
    expect(mussa.filter((x) => x.codigo_escala === "LD").length).toBe(27);
  });

  test("folgas guardadas: 44 saldos trazidos do mapa, 86 dias no total", () => {
    expect(dados!.folgas.length).toBe(44);
    const total = dados!.folgas.reduce((s, f) => s + f.valor, 0);
    expect(total).toBeCloseTo(86);
    expect(dados!.folgas.every((f) => f.obs.includes("Excel"))).toBe(true);
  });

  test("nomes divergentes resolvidos com aviso (Candido -> Candiado)", () => {
    const barreto = dados!.colaboradores.find((c) => chaveNome(c.nome).includes("barreto"));
    expect(barreto?.codigo).toBe("DM0247");
    expect(barreto?.contacto).toBe("875667668");
    const sousa = dados!.colaboradores.find((c) => chaveNome(c.nome).includes("sousa tome"));
    expect(sousa?.codigo).toBe("DM0246");
    const avisos = dados!.problemas.filter((p) => p.includes("Nome aproximado"));
    expect(avisos.length).toBe(2);
  });

  test("estagiários EST ganham sufixo único (EST-02 a EST-11)", () => {
    const ests = dados!.colaboradores.filter((c) => /^EST-\d{2}$/.test(c.codigo));
    expect(ests.length).toBe(10);
    const codigos = new Set(ests.map((c) => c.codigo));
    expect(codigos.has("EST-02")).toBe(true);
    expect(codigos.has("EST-11")).toBe(true);
  });

  test("nenhuma pessoa ficou sem código e sem área válida", () => {
    expect(dados!.colaboradores.every((c) => c.codigo && !c.codigo.startsWith("SEM-"))).toBe(true);
    const areas = new Set(dados!.colaboradores.map((c) => c.area));
    for (const a of areas) {
      expect(["Supervisores", "Grupos de Turno", "Pneumáticos", "Mecânica", "Eléctrica", "Serralharia", "Outros"]).toContain(a);
    }
  });

  test("o Excel semanal de 2020 não é fonte de dados (0 pessoas, tudo explicado)", () => {
    // a leitura é possível mas não produz registo útil: o semanal do
    // portal nasce da mensal, nunca do ficheiro antigo
    const semanal = "ESCALA SEMANAL 2026.xlsx";
    if (!fs.existsSync(semanal)) return;
    const buf = fs.readFileSync(semanal);
    const d = lerEscalasDeBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(d.meses.length).toBe(0);
    expect(d.problemas.some((p) => p.includes("sem mês reconhecível") || p.includes("ignorada"))).toBe(true);
  });
});
