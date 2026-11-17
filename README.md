# danmo - Portal Interno (nova geração)

Portal interno da Danmo Service System, Lda (Porto da Beira, Moçambique).

Esta é a nova versão do portal, construída sobre Next.js 16 (App Router), com a
base de dados no Supabase e o deploy na Vercel.

## Porquê uma nova versão

A versão anterior (danmo-hub) funcionava no navegador: cada colega recebia as
chaves da base de dados no próprio browser. Nesta nova geração o motor passa a
correr no servidor e o navegador mostra apenas o resultado. Vantagens directas:

- As chaves da base de dados nunca chegam ao navegador;
- A sessão vive num cookie protegido (httpOnly), não no localStorage;
- Cada pedido valida a sessão e as permissões no servidor antes de devolver dados;
- O filtro por utilizador acontece no servidor, não no ecrã;
- Se uma actualização tiver um erro, o deploy falha ANTES de publicar
  (a versão boa continua no ar, nada quebra para os colegas).

## Módulos no ar

| Área (menu)            | Módulo                                    | Estado  |
|------------------------|-------------------------------------------|---------|
| Oficina & Manutenção   | OS, Checklist, Equipamentos, Faturação CdM| No ar   |
| Disponibilidade Equip. | Grelha diária, Horómetro, Resumo semanal  | No ar   |
| Admin. Oficinal        | Quadro de Pessoal, Aniversários, Documentos | No ar |
| Admin. Oficinal        | Pedidos de Aquisição                      | No ar   |
| Admin. Oficinal        | Plano de Férias                           | No ar   |
| Admin. Oficinal        | Faturação (Cotações e Faturas)            | No ar   |
| Gestão de Stock        | Materiais, Entradas, Saídas, Relatórios   | No ar   |
| Portal HST             | Acidentes, Áreas de Risco, EPIs, Tensão   | No ar   |
| Ferramentaria          | Inventário, Empréstimos, Danos            | No ar   |
| Permissões             | Matriz por utilizador, página a página    | No ar   |
| Admin. Oficinal        | Avaliação de Desempenho                   | Segue   |

Páginas novas nascem SEM linha na matriz de permissões: ninguém as vê até a
administração destravar à mão na página Permissões.

## O módulo Escalas (OCULTO, Fase 9)

A escala mensal e a semanal saíram do Excel para o portal, mas o Filomeno
decidiu NÃO acoplar o módulo agora: está com bugs e, ao contrário do que se
queria, ficou mais trabalhoso fazer a escala. O código TODO continua no
repositório, porém invisível no sistema:

- sem grupo no menu (Admin. Oficinal), sem cartão no Início e SEM linhas na
  matriz de permissões;
- quem não é admin recebe página bloqueada e APIs com 403; o admin ainda
  consegue abrir por URL directo para futuros testes.

Para voltar a acoplar quando as correções justificarem: voltar a colocar o
grupo "Escalas" com as 5 páginas em `src/lib/permissoes.ts` (MODULOS, grupo
Admin. Oficinal), o prefixo "Escalas - " em labelPagina, o cartão no
`painel-inicio.tsx` e a prova das 55 páginas em `tests/logica_permissoes.test.ts`.
A migração dos dados continua igual: colar `sql/fase9-escalas.sql` no Supabase
e importar o Excel em Configurações (o importador é tudo lido no navegador).

## Configuração (2 chaves, uma vez só)

O sistema lê as chaves da base de dados de variáveis de ambiente:

- `SUPABASE_URL`: endereço do projeto Supabase;
- `SUPABASE_KEY`: chave pública (anon) do projeto.

Em desenvolvimento local: copia `.env.example` para `.env.local` e preenche.
Na Vercel: Project Settings > Environment Variables (uma vez só).

## Ligação à base de dados

O projeto usa o MESMO Supabase e as MESMAS tabelas do danmo-hub actual. Nada
migra de lugar; os módulos novos criam as suas tabelas próprias (ficheiros
`sql/fase*.sql`, colados no Supabase pelo SQL Editor).

## Desenvolvimento

```bash
bun install
bun run dev
```

Provas antes de qualquer subida: `bun test` (lógica + importador),
`bunx tsc --noEmit`, `bun run lint`, `bun run build` e os testes visuais
(`tests/*_visual.js`, com o servidor de estrutura sem chaves na porta indicada
em cada teste).
