/**
 * Prova rápida do parser contra os Excel reais da raiz (debug).
 */
import * as fs from "fs";
import { lerEscalasDeBuffer } from "../src/lib/escalas-import";

const caminho = process.argv[2] || "ESCALA MENSAL 2026.xlsx";
if (!fs.existsSync(caminho)) {
  console.log("FICHEIRO AUSENTE:", caminho);
  process.exit(0);
}
const buf = fs.readFileSync(caminho);
const dados = lerEscalasDeBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
console.log("COLABORADORES:", dados.colaboradores.length);
console.log("MESES:", dados.meses.map((m) => `${m.ano}-${String(m.mes).padStart(2, "0")}(${m.celulas.length})`).join(", "));
console.log("FOLGAS:", dados.folgas.length, "valor total:", dados.folgas.reduce((s, f) => s + f.valor, 0));
console.log("PROBLEMAS:", dados.problemas.length);
dados.problemas.slice(0, 15).forEach((p) => console.log("  -", p));
console.log("\nPRIMEIRAS 12 PESSOAS:");
dados.colaboradores.slice(0, 12).forEach((c) =>
  console.log(`  ${c.codigo} ${c.nome} | ${c.categoria} | ${c.area} | G${c.grupo || "-"} | ${c.contacto} | ordem ${c.ordem}`)
);
const porArea: Record<string, number> = {};
dados.colaboradores.forEach((c) => (porArea[c.area] = (porArea[c.area] || 0) + 1));
console.log("\nPOR ÁREA:", porArea);
const turnos = dados.colaboradores.filter((c) => c.area === "Grupos de Turno");
console.log("\nGENTE DE TURNO:", turnos.length, "grupos:", [...new Set(turnos.map((t) => t.grupo))].join(","));
const nov = dados.meses.find((m) => m.mes === 11);
if (nov) {
  console.log("\nAMOSTRA NOV:", nov.celulas.slice(0, 8));
}
const semCodigo = dados.colaboradores.filter((c) => c.codigo.startsWith("SEM-"));
console.log("\nSEM CÓDIGO:", semCodigo.length, semCodigo.slice(0, 5).map((c) => c.nome));
