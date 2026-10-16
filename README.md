# Kurio — Marketplace de NFTs

Implementação do desafio frontend da Jungle Gaming (enunciado em [`docs/challenge.md`](docs/challenge.md)), com React, TypeScript, TanStack Router, TanStack Query, Axios, Socket.IO, Tailwind CSS, shadcn/ui, MSW e Playwright.

> **Status: Fase F5B (histórico de pedidos), aguardando revisão.** A área autenticada reúne perfil, carteiras e pedidos do usuário. O histórico acompanha os estados da F4 em tempo real e reutiliza a tela existente de detalhes/recibo. F6 não faz parte desta fase. Decisões e limitações estão em [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Requisitos

- Node.js 22.12 ou superior (desenvolvido com Node 24)
- npm (o lockfile versionado é o `package-lock.json`)

## Setup

```bash
npm ci
npx playwright install chromium   # necessário só para os testes E2E
npm run dev                       # http://localhost:5173, com mocks ativos
```

## Variáveis de ambiente

Nenhuma variável é secreta. Os arquivos `.env.development` e `.env.production` são versionados e contêm apenas flags públicas.

- `VITE_ENABLE_MOCKS`: `true` ativa o MSW (REST e Socket.IO simulados). Vem ativa em desenvolvimento e no build de produção, porque o deploy público é a demonstração.
- `PLAYWRIGHT_BASE_URL` (opcional, só para testes): URL de um ambiente publicado. Quando definida, o Playwright não sobe servidor local.
- `EXPECTED_COMMIT_SHA` (opcional, só para testes): hash completo do commit que deveria estar publicado. Habilita o teste que compara a versão do deploy.

Arquivos `*.local` (por exemplo, `.env.local`) são ignorados pelo git e nunca entram no bundle.

## Comandos

- `npm run dev`: desenvolvimento com mocks.
- `npm run build`: typecheck + build de produção em `dist/`.
- `npm run preview`: serve o build em http://localhost:4173.
- `npm run typecheck`: TypeScript (app, configs e testes).
- `npm run lint`: ESLint, incluindo as regras de fronteira entre camadas.
- `npm run verify`: typecheck, lint e build, nesta ordem.
- `npm run test:e2e`: todos os testes Playwright (builda e sobe o preview automaticamente).
- `npm run test:e2e:smoke`: apenas os testes marcados com `@smoke`.
- `npm run test:e2e:deploy`: smoke contra o deploy; exige `PLAYWRIGHT_BASE_URL`.
- `npm run test:e2e:report`: abre o último relatório HTML.
- `npm run lighthouse`: coleta F8 em lotes de três rodadas para uma página/perfil contra um preview já em execução. Exemplo: `npm run lighthouse -- --collection f8-<id> --page home --preset mobile http://127.0.0.1:4173`. Repita para `home/detail` × `mobile/desktop`, então gere `npm run lighthouse -- --collection f8-<id> --summary`. Cada coleção fica em `lighthouse/f8-<id>/`; o resumo só é escrito quando os 12 relatórios forem válidos.

### Testar o deploy

```bash
PLAYWRIGHT_BASE_URL=https://<sua-url>.vercel.app \
EXPECTED_COMMIT_SHA=$(git rev-parse HEAD) \
npm run test:e2e:deploy
```

## Mocks e demonstração

O MSW é iniciado antes da renderização e intercepta HTTP e WebSocket na própria página. Os dados ficam num banco simulado no `localStorage` do navegador: sobrevivem ao refresh e são independentes por navegador.

### Contas fictícias

| E-mail | Senha | Nome |
| --- | --- | --- |
| `ana@kurio.test` | `kurio-ana-2026` | Ana Costa |
| `bruno@kurio.test` | `kurio-bruno-2026` | Bruno Lima |

Também é possível criar contas novas em "Criar conta". As senhas são guardadas só como hash PBKDF2 com salt. Isto é **autenticação simulada**, não equivale à segurança de um backend (detalhes na seção 11 do `ARCHITECTURE.md`).

### Painel da demonstração

O painel no rodapé mostra a sessão atual, o estado e a identidade da conexão em tempo real, os contadores de eventos, o cenário ativo, o estado do armazenamento e a versão publicada. No desktop, feche o modal de login para usar o painel (o modal torna o resto da página inerte, por acessibilidade).

- **Latência:** atraso aplicado a toda chamada `/api/*` (0 a 3000 ms no painel; até 10000 ms pela API).
- **Falha da API:** "Erro interno (500)", "Serviço indisponível (503)" ou "Sem rede".
- **Cliente de tempo real:** "Falha ao carregar" faz o carregamento do cliente Socket.IO falhar na próxima carga da página; o app mostra o aviso de tempo real indisponível, com nova tentativa.
- **Expirar sessão:** vence a sessão no banco; a próxima chamada recebe um 401 real e o app leva ao login, guardando a rota de retorno.
- **Bloquear tempo real:** derruba o socket e recusa novas conexões. O app mantém os dados do REST e avisa; ao liberar, reconecta e refaz as consultas.
- **Restaurar estado inicial:** recria o banco a partir do seed, volta ao cenário padrão (100 ms, sem falha), encerra a sessão e recarrega na home.

### Reproduzir falhas

- **API fora do ar:** escolha a falha no painel, clique em "Aplicar cenário" e tente entrar. Volte para "Nenhuma falha" para recuperar.
- **Sessão expirada:** entre, abra "Meu perfil", digite algo no nome de exibição sem salvar e clique em "Expirar sessão". Depois de entrar de novo, você volta ao perfil com o rascunho restaurado.
- **Conta:** em "Meu perfil", edite o nome, envie/remova um avatar ou altere a senha. Em "Carteiras", edite os dois slots ou marque a secundária como "Igual à principal"; as mudanças continuam disponíveis no checkout após refresh.
- **Armazenamento corrompido:** no console, `localStorage.setItem('kurio:mock-db:v1', '{')` e recarregue. O painel mostra "corrompido" e as chamadas falham com uma mensagem clara até o reset.
- **Armazenamento cheio:** preencha o `localStorage` até a cota e tente criar uma conta: o cadastro falha com aviso, sem criar a conta (o teste `mocks.spec.ts` faz isso automaticamente).

### API de controle

Disponível só com `VITE_ENABLE_MOCKS=true`. O painel e os testes usam estas rotas; o app nunca acessa o banco diretamente.

- `GET /__mock/status` e `GET /__mock/state`: estado do mock, sem segredos.
- `GET`/`PUT /__mock/scenario`: cenário de rede, por exemplo `{ "latencyMs": 1500, "failure": "none" }`. `"payment"` define como termina o pagamento dos próximos pedidos: `confirm` (padrão), `reject` ou `hold` (fica pendente até ser resolvido). `"wallet"` define a resposta do app de carteira ao conectar: `approve` (padrão) ou `reject`.
- `POST /__mock/reset`: restaura o seed.
- `POST /__mock/session/expire`: vence as sessões ativas.
- `POST /__mock/socket/disconnect` e `GET /__mock/socket/connections`: conexões Socket.IO (e tentativas recusadas durante o bloqueio).
- `POST /__mock/users/:userId/profile`: muda o nome de um usuário e emite o evento em tempo real.
- `POST /__mock/nfts/:nftId/update`: muda preço (`{ "priceEth": "0.99" }`) ou estoque de um NFT e emite `nft.updated`.
- `POST /__mock/nfts/:nftId/replay`: reenvia o último evento (`{ "kind": "duplicate" }`) ou um antigo (`"stale"`).
- `POST /__mock/socket/block`: `{ "blocked": true }` deixa o servidor de tempo real inalcançável; `false` libera.
- `POST /__mock/network/delays`: atrasos de uso único por prefixo de rota (e método), opcionalmente com falha, para respostas fora de ordem e mudanças concorrentes. Com `"phase": "response"`, o mock processa a requisição e só retém a resposta.
- `GET /__mock/network/activity`: requisições em andamento e contagem por rota, para os testes esperarem sem pausas fixas.
- `GET /__mock/users/:userId/favorites`: favoritos gravados de um usuário.
- `GET /__mock/carts`: carrinhos gravados (contas e visitantes) e ids de visitante já juntados.
- `GET /__mock/quotes/:quoteId`: uma cotação exatamente como `POST /api/quotes` a respondeu.
- `GET /__mock/orders`: pedidos gravados (dono, estado, chave de idempotência, cotação e total).
- `POST /__mock/orders/:orderId/resolve`: `{ "outcome": "confirmed" }` ou `"rejected"` liquida agora um pedido pendente; um pedido já confirmado ou recusado responde 409 e não muda. Sem isso, `confirm` e `reject` liquidam sozinhos 1,5 s depois da criação e avisam o dono por `order.updated`.
- `POST /__mock/orders/:orderId/replay`: reenvia ao dono o último `order.updated` do pedido (`{ "kind": "duplicate" }`) ou o anterior com id novo (`"stale"`); `"delivery": "broadcast"` envia a todos os sockets, simulando um erro de roteamento. 409 se o pedido ainda não emitiu eventos.
- `POST /__mock/wallets/disconnect`: o app de carteira derruba as conexões (`{ "userId": "usr_ana" }` para um usuário só).

### Carrinho e cupons

- Cupons de demonstração: `KURIO10` (10% de desconto) e `EXPIRED` (vencido); qualquer outro código é recusado.
- Para ver o ajuste em tempo real, abra o carrinho com itens e mude o preço ou o estoque pela API de controle, por exemplo `POST /__mock/nfts/velvet-oracle-240/update` com `{ "available": { "ed_velvet-oracle-240-open": 0 } }`.

Exemplo, no console do navegador com a aplicação aberta:

```js
await (await fetch('/__mock/scenario', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ latencyMs: 1500, failure: 'none' }),
})).json()
```

## Deploy (Vercel)

A configuração está em [`vercel.json`](vercel.json):
- `npm ci` e `npm run build`, com saída em `dist`.
- Rewrite de todas as rotas para `index.html`, para que acesso direto e refresh funcionem. Os arquivos estáticos existentes têm prioridade.
- `Cache-Control: no-cache, no-store, must-revalidate` em `/mockServiceWorker.js`, para que um worker antigo nunca fique em cache.
- Cache imutável para `/assets/*`, que têm hash no nome.

Para publicar: importar o repositório no painel da Vercel (preset Vite). Nenhuma variável precisa ser configurada.

## Estrutura

```
src/
  app/          bootstrap: env, QueryClient, router
  contracts/    schemas zod compartilhados por app, mocks e testes
  routes/       rotas do TanStack Router (file-based); privadas em _authenticated/
  features/     auth, account, catalog, favorites, cart, demo (painel), home
  shared/       api (Axios), session, realtime (Socket.IO), forms, feedback, layout, ui
  lib/          utilitários puros (cn, ETH)
  components/   componentes shadcn/ui
  mocks/        MSW: banco simulado, handlers REST, cenários, Socket.IO, controle
e2e/            testes Playwright
scripts/        exportação de assets do Figma (usa FIGMA_TOKEN do .env.local) e sondagem Lighthouse
```
