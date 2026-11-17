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
| Admin. Oficinal        | Escalas (Mensal, Semanal, Folgas)         | No ar   |
| Gestão de Stock        | Materiais, Entradas, Saídas, Relatórios   | No ar   |
| Portal HST             | Acidentes, Áreas de Risco, EPIs, Tensão   | No ar   |
| Ferramentaria          | Inventário, Empréstimos, Danos            | No ar   |
| Permissões             | Matriz por utilizador, página a página    | No ar   |
| Admin. Oficinal        | Avaliação de Desempenho                   | Segue   |

Páginas novas nascem SEM linha na matriz de permissões: ninguém as vê até a
administração destravar à mão na página Permissões.

## O módulo Escalas (Fase 9)

A escala mensal e a escala semanal saíram do Excel para o portal.

- **Mensal**: a grelha de sempre (colaboradores x dias com os códigos da
  legenda da casa: 07/19, 19/07, Norm., Folga, Sup., Esc., LD, FRD, CCIS, TDP).
  Edição por célula, por intervalo de dias e 4 ferramentas em lote: Férias do
  plano (LD vem de ferias_plano), Gerar ciclo de turnos A-D (padrão 07/19
  07/19 19/07 19/07 + 4 folgas com desfasamento 2 dias entre grupos; quem tem
  férias no mês fica fora com aviso de auditoria), Feriados (FRD vem de
  ferias_feriados) e Norm. nas vazias. Contagens por área e do dia, nota
  importante do mês.
- **Semanal**: nasce da mensal com um clique, semana de Sábado a Sexta, com o
  bloco dos turnos dia a dia e os contactos que o cliente usa para ligar.
- **Folgas Guardadas**: as folgas que a gente acumula (aceita meios dias), com
  saldo por pessoa e gozo marcado por data.
- **Colaboradores & Contactos**: o registo da gente da escala (código, nome,
  contacto, categoria, área, grupo de turno A-D, ordem de afixação).
- **Configurações**: importador do Excel mensal (o ficheiro é lido no próprio
  navegador e nunca sai da máquina) e feriados.
- **Papéis A4** para a vitrine: /imprimir/escalas/mensal e
  /imprimir/escalas/semanal (paisagem, com contagens, legenda e nota).

Para activar, uma única vez:

1. Colar o `sql/fase9-escalas.sql` no Supabase (SQL Editor > New query > RUN);
2. Em Admin. Oficinal > Escalas > Configurações, importar o ESCALA MENSAL
   (importa o registo, as grelhas dos meses e o saldo de folgas);
3. Distribuir as 5 páginas na matriz (Permissões) a quem deve usar.

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
