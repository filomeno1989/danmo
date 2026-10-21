/**
 * editor-tipos.tsx - Tipos partilhados entre o editor e as tabelas.
 */

export type Linha = {
  _id: string;
  item_tipo: "mao" | "material" | "material_cliente";
  tecnico_id: string;
  descricao: string;
  qtd: number;
  tempo: number;
  unidade: string;
  valor_unit: number;
};

export type MaterialLinha = {
  id: string;
  referencia: string | null;
  nome: string;
  unidade: string | null;
  preco_mzn: number | null;
};
