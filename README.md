# danmo - Portal Interno (nova geração)

Portal interno da Danmo Service System, Lda.

Esta é a nova versão do portal, construída sobre Next.js 16 (App Router).

## Porquê uma nova versão

A versão anterior (danmo-hub) funciona no navegador: cada colega recebia as chaves
da base de dados no próprio browser. Nesta nova geração o motor passa a correr no
servidor e o navegador mostra apenas o resultado. Vantagens directas:

- As chaves da base de dados deixam de viajar para o navegador;
- A sessão vive num cookie protegido (httpOnly), e não no localStorage;
- Cada pedido valida a sessão e as permissões no servidor antes de devolver dados;
- O filtro por utilizador acontece no servidor, não no ecrã;
- Se uma actualização tiver um erro, o deploy falha ANTES de publicar
  (a versão boa continua no ar, nada quebra para os colegas).

## Estado da migração

| Fase | Módulo                                | Estado        |
|------|----------------------------------------|---------------|
| 1    | Fundação (login, menu, tema, painel)   | Em curso      |
| 2    | Faturação                              | Aguarda       |
| 3    | Oficina e Manutenção                   | Aguarda       |
| 4    | Stock e Aquisição                      | Aguarda       |
| 5    | Ferramentaria e HST                    | Aguarda       |
| 6    | RH, Avaliação e Férias                 | Aguarda       |
| 7    | Permissões (matriz visual)             | Aguarda       |

## Configuração (2 chaves, uma vez só)

O sistema lê as chaves da base de dados de variáveis de ambiente:

- `SUPABASE_URL`: endereço do projeto Supabase;
- `SUPABASE_KEY`: chave pública (anon) do projeto.

Em desenvolvimento local: copia `.env.example` para `.env.local` e preenche.
Na Vercel: Project Settings > Environment Variables (uma vez só).

## Ligação à base de dados

O projeto usa o MESMO Supabase e as MESMAS tabelas do danmo-hub actual.
Nenhum dado migra de lugar. A migração é só de código.

## Desenvolvimento

```bash
bun install
bun run dev
```
