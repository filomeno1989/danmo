/**
 * /ferramentaria/inventario - Inventário de ferramentas (tabela tools).
 *
 * Migração do inventario.html do hub: tabela com pesquisa (sem acentos),
 * filtros de categoria e estado, modal de nova/edição e modal de
 * histórico por ferramenta. Código duplicado recusa-se no SERVIDOR
 * (409) e, se a ferramenta está na rua, o estado segue "emprestado"
 * mesmo que o formulário diga outra coisa.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { InventarioClient } from "./inventario-client";

export const metadata = { title: "Inventário | Ferramentaria | Portal Danmo" };

export default async function PaginaInventario() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "ferramentaria.inventario", "ver")) {
    return <SemAcesso pagina="ferramentaria.inventario" />;
  }

  return <InventarioClient />;
}
