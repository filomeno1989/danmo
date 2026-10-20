/** Confirma que a 45-44 tem outra obra aberta a cobrir o dia 2026-10-04. */
import { query, queryTudo } from "../src/lib/supabase";

type Eq = { id: number; code: string };
type OS = {
  id: number;
  numero_obra: string | null;
  data_abertura: string | null;
  data_fecho: string | null;
  status_atual: string;
  status_fisico: string | null;
};

const eqs = await query<Eq>("equipment", "select=id,code&code=eq.45-44");
const eq = eqs[0];
console.log("Máquina 45-44:", eq);
const ordens = await queryTudo<OS>(
  "ordens_servico",
  `select=id,numero_obra,data_abertura,data_fecho,status_atual,status_fisico&equipment_id=eq.${eq.id}&order=data_abertura.asc`
);
for (const o of ordens) {
  console.log(
    `  obra ${o.numero_obra || o.id}: abertura ${o.data_abertura?.slice(0, 10)} fecho ${o.data_fecho?.slice(0, 10) || "-"} | ${o.status_atual} / ${o.status_fisico}`
  );
}
