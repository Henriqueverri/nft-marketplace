# Arquitetura — Kurio

Documento vivo: cada fase atualiza as seções que toca. Estado atual: **F1 (contratos, mocks e sessão)**, aguardando revisão.

## 1. Camadas e responsabilidades

- **`src/app`**: composição da aplicação. Variáveis de ambiente (`env.ts`), `QueryClient` com a política padrão de cache e retry (`query-client.ts`) e criação do router com contexto tipado (`router.ts`).
- **`src/routes`**: rotas file-based do TanStack Router. Devem ser finas: validação de search params, guards e ligação com as features. A árvore `src/routeTree.gen.ts` é gerada pelo plugin e versionada, para que `tsc -b` funcione num checkout limpo antes do build. As rotas privadas ficam sob o layout `_authenticated` (seção 12).
- **`src/contracts`**: schemas zod e tipos dos contratos, compartilhados por app, mocks e testes (seção 10).
- **`src/features`**: telas e lógica por domínio. `auth` (formulários, modal, página mobile, queries de sessão, guards e sanitização do redirect), `account` (perfil provisório), `demo` (painel de cenários) e `home`.
- **`src/shared/api`**: a instância Axios única (`http.ts`), o cliente da API de controle do mock e o modelo de erro (`errors.ts`).
- **`src/shared/session`**: o store da sessão, o vínculo com o `QueryClient`, as chaves de query privadas e os rascunhos por usuário.
- **`src/shared/realtime`**: o único lugar que conhece o `socket.io-client`.
- **`src/shared/forms`**, **`feedback`**, **`hooks`**, **`layout`**: campos de formulário, anunciador global (`role=status`), media query e páginas genéricas.
- **`src/lib`**: utilitários puros (`cn` configurado, aritmética de ETH em `bigint`).
- **`src/components/ui`**: componentes shadcn/ui, adaptados aos tokens do Kurio.
- **`src/mocks`**: MSW. Banco simulado (`db/`), handlers REST (`api/`), cenários de rede, servidor Socket.IO simulado e API de controle (`/__mock/*`). Nada fora daqui contém respostas fictícias.
- **`e2e`**: testes Playwright. Não importam código do app; as contas fictícias estão duplicadas em `e2e/support/auth.ts` de propósito.

**Fronteiras garantidas por lint** (`eslint.config.js`):
- `msw`, `@mswjs/*` e `@/mocks/*` não podem ser importados fora de `src/mocks`. A única entrada é o `import()` dinâmico no `main.tsx`, que o `no-restricted-imports` não analisa; essa exceção é deliberada e única. Em consequência, **o frontend nunca importa handlers nem o banco**.
- `socket.io-client` só pode ser importado em `src/shared/realtime`.
- `fetch` global é proibido fora de `src/mocks`; chamadas REST passam pelo Axios.
- O pacote `cn` só pode ser importado em `src/lib/utils.ts` (seção 6).

Essas regras foram testadas com arquivos de exemplo: os três casos proibidos geram erro, e o mesmo código em `src/mocks` passa.

## 2. Bootstrap

```mermaid
sequenceDiagram
  participant Main as main.tsx
  participant MSW as MSW worker
  participant React as React render
  participant RT as RealtimeProvider
  participant IO as socket.io-client
  Main->>MSW: import dinâmico + worker.start()
  MSW-->>Main: service worker ativo e WebSocket interceptado
  Main->>React: createRoot().render()
  React->>RT: useEffect
  RT->>IO: import('socket.io-client') + io().connect()
  IO->>MSW: WebSocket /socket.io/?EIO=4&transport=websocket
  MSW-->>IO: handshake engine.io + CONNECT + system.hello
```

O `main.tsx` usa top-level await. A renderização só acontece depois do `worker.start()`, de modo que nenhuma requisição e nenhuma conexão escapam do mock. Antes de criar o router, o `main.tsx` chama `bindSessionToQueryClient(queryClient)` (seção 13); a árvore fica `QueryClientProvider` → `AnnouncerProvider` → `RealtimeProvider` → `RouterProvider`.

## 3. Tempo real: Socket.IO sobre MSW

**Transporte:** o app usa `socket.io-client` 4.8 com `transports: ['websocket']`. O MSW 2.15 intercepta o `WebSocket` dentro da página (não no service worker) com o handler `ws.link`. O `@mswjs/socket.io-binding` 0.2.0 traduz os pacotes engine.io e Socket.IO.

Três ajustes foram necessários. Todos foram descobertos e confirmados empiricamente na F0:

1. **O handler aponta para a origem, não para `/socket.io/`.** O MSW 2.15 remove o prefixo `/socket.io/` e a query da URL do cliente antes de comparar (`WebSocketHandler.parse`). Com `ws.link('ws://host/socket.io/')`, a URL real (`/socket.io/?EIO=4&transport=websocket`) não casava, e a conexão seguia para a rede, recebendo HTTP 200 do servidor estático. Uma expressão regular também não casa, porque a comparação é feita depois dessa limpeza. Isso foi confirmado executando o próprio `WebSocketHandler.test()` do MSW com as URLs candidatas.
2. **Heartbeat do engine.io.** O binding anuncia `pingInterval: 25000` e `pingTimeout: 5000` no handshake, mas nunca envia pings. O `socket.io-client` encerra a conexão por "ping timeout" após 30 s sem ping. O mock envia o pacote de ping (`2`) a cada 25 s. **Prova:** com o heartbeat desligado temporariamente, o teste de estabilidade registrou 3 conexões em 65 s, em vez de 1.
3. **`socket.io-client` carregado sob demanda.** O `engine.io-client` 6.6 guarda `globalThis.WebSocket` numa constante quando o módulo é avaliado (`transports/websocket.js`). Se ele fosse avaliado antes do `worker.start()`, usaria o `WebSocket` original, sem interceptação. O `createRealtimeSocket()` faz `import('socket.io-client')`, o que garante a ordem e tira a biblioteca do bundle inicial.

**Limitações conhecidas do transporte simulado.** As do binding foram confirmadas lendo o código instalado (`node_modules/@mswjs/socket.io-binding/src/index.ts`, versão 0.2.0):

- **Só WebSocket.** Long-polling HTTP do engine.io não é simulado.
- **Só o namespace padrão.** `emit` codifica sempre `nsp: '/'` (há um `@todo Support custom namespaces` no código), e o binding confirma o CONNECT com `40` (namespace `/`) por conta própria, num microtask, antes de ler qualquer pacote do cliente. Um cliente que pedisse `/orders` nunca seria confirmado nesse namespace.
- **Sem rooms nem broadcast.** São conceitos do servidor Socket.IO, que o binding não reimplementa. O mock só tem a lista de conexões que ele mesmo mantém (`activeConnections`).
- **Sem ACKs.** O listener recebe `(messageEvent, ...data)`, sem callback. Pacotes ACK do cliente são descartados, e o servidor não consegue responder com ACK.
- **ID de conexão fixo.** O handshake anuncia `sid: 'test'` no engine.io e no CONNECT, para todas as conexões. Assim, `socket.id` no cliente vale `'test'` sempre e não pode ser usado como identidade. O mock identifica conexões por `raw.client.id`, que o MSW gera de forma única.
- **Sem leitura do `auth`.** `on()` decodifica os pacotes, mas ignora tudo que não é EVENT. O pacote CONNECT, que carrega o `auth` do `io(url, { auth })`, nunca chega aos listeners. Como o binding confirma a conexão antes, também não há como recusá-la com CONNECT_ERROR (`44`) no fluxo nativo.

**Impacto no isolamento de usuários e no direcionamento de eventos.** Decidido e implementado na F1; veja a seção 14 (autenticação do socket). Em resumo: o mock mantém o mapa `conexão → userId`, lê o `auth` do pacote CONNECT bruto e recusa tokens inválidos com `44`. Sem ACKs, toda confirmação continua sendo um evento explícito de resposta, como em `system.ping`/`system.pong`.

**Outras limitações:**
- A interceptação existe só na aba atual. Cada aba tem seu próprio "servidor".
- O DevTools do navegador não mostra frames dessas conexões como WebSocket de rede, e o `page.on('websocket')` do Playwright não as vê. A verificação é feita pela UI e pela API de controle do mock. A ausência de WebSocket de rede é justamente a evidência de que a conexão foi interceptada.

**Contrato dos eventos** (`src/contracts/events.ts`): envelope `{ eventId, type, resource: { kind, id }, version, occurredAt, userId?, payload }`. Existem `system.hello` (servidor → cliente, depois de processar o CONNECT; payload `{ connectionId, userId | null }`), `system.ping` / `system.pong` (eco) e, desde a F1, `profile.updated` (privado, `userId` obrigatório, payload `AccountProfile` com `version`). `nft.updated` e `order.updated` já estão tipados para F2 e F4.

## 4. MSW no deploy

- O build de produção é a demonstração: `.env.production` define `VITE_ENABLE_MOCKS=true`.
- `public/mockServiceWorker.js` é gerado por `npx msw init public --save` e mantido na versão do pacote (`msw.workerDirectory` no `package.json`).
- A Vercel serve o worker com `Cache-Control: no-cache, no-store, must-revalidate`, para evitar que uma versão antiga fique registrada.
- A SPA usa rewrite de todas as rotas para `index.html`. Limitação: rotas inexistentes respondem HTTP 200 com o app, que então renderiza a página 404.
- **Custo de performance:** o chunk do MSW tem cerca de 434 kB (cerca de 162 kB gzip) e é carregado antes do primeiro render. Será medido na sondagem de Lighthouse (F2).

## 5. Estado remoto e HTTP

- **Axios** (`src/shared/api/http.ts`): base `/api`, timeout de 10 s.
  - Request: adiciona `Authorization: Bearer <token>` e marca a requisição com a época da sessão; combina o `signal` do chamador com o da sessão (`AbortSignal.any`), de modo que trocar de sessão aborta tudo que estava em voo.
  - Response: se a época mudou enquanto a requisição viajava, a resposta é descartada com `SESSION_CHANGED`, mesmo que tenha chegado com sucesso.
  - Erros: todo erro vira `ApiError` (`src/shared/api/errors.ts`) com `code`, `status`, `message` em português e `fieldErrors`. Um 401 numa requisição feita com token, na mesma época, encerra a sessão como `expired`. 403, 409 e 422 chegam ao formulário com o código e os erros por campo.
  - `parseResponse(schema, data)` valida a resposta com o schema do contrato; resposta fora do contrato vira `UNEXPECTED_RESPONSE`.
  - `mockControlHttp`: instância separada para `/__mock`, sem token.
- **TanStack Query** (`src/app/query-client.ts`):
  - Queries: até 2 novas tentativas, só para erro de rede, timeout ou 5xx, com backoff exponencial limitado a 4 s; 4xx nunca é repetido.
  - `staleTime` padrão de 30 s; `refetchOnWindowFocus` desligado.
  - Mutations sem retry. A recuperação do pedido será feita com chave de idempotência (F4).

## 6. Estilo e design system

- **Tailwind CSS 4**, com configuração CSS-first: tokens do Figma no `@theme` de `src/index.css` (cores, escala tipográfica, sombras).
- **shadcn/ui** com base Radix, preset Nova. As variáveis semânticas (`--primary`, `--background`, ...) foram mapeadas para a paleta do Kurio. O app tem tema escuro único (`<html class="dark">`).
- O CLI 4.21 usa o pacote `cn` (mantido pelo shadcn) no lugar de `clsx` + `tailwind-merge`. **Problema encontrado na F1:** sem configuração, o merge lia `text-body-14` (tamanho) como cor e o descartava ao lado de `text-cream`; confirmado no Node (`cn('text-caption-13 text-cream')` → `'text-cream'`). **Correção:** `src/lib/utils.ts` cria o `cn` com `createCn` e registra a escala tipográfica do Kurio no grupo `font-size`; os componentes shadcn importam daí, e o lint proíbe importar `cn` direto do pacote.
- Token novo: `--color-border-field: #3f2319`, a borda dos campos e botões sociais dos modais de autenticação.
- **Fonte:** Roboto Mono 400/500/700, subset latin (que cobre os acentos do português), via `@fontsource/roboto-mono`. Os arquivos ficam no próprio bundle, sem requisição externa.

## 7. Testes

- Playwright com Chromium em dois projetos: `desktop` (1440×900) e `mobile` (Pixel 7, 390×844).
- Sem retries automáticos (`retries: 0`), para não esconder instabilidade. Traces ficam em `retain-on-failure` e o relatório HTML em `playwright-report/`.
- Os testes chamam a API de controle de dentro da página (`fetch` no contexto do navegador). A requisição passa pelo service worker do MSW, como qualquer requisição do app. Não há `page.route`.
- **Teste pulado de propósito:** `deployed build matches the expected commit` só roda quando `EXPECTED_COMMIT_SHA` está definido. No build local, o SHA embutido é sempre `local`, porque `VERCEL_GIT_COMMIT_SHA` só existe na Vercel. Por isso o teste só tem sentido contra o deploy, com `npm run test:e2e:deploy`. Localmente e no CI, ele aparece como 2 pulados (um por projeto).
- **Arquivos (F1):** `smoke` (rotas públicas, guard das privadas, MSW e socket anônimo), `realtime-poc` (F0), `auth` (cadastro, login, logout, expiração, retorno à rota, open redirect, proteção de rotas), `isolation` (troca A→B sem refresh, vazamento em storage, resposta atrasada, socket e eventos), `mocks` (reset, persistência, senha ausente, falhas de API e de storage).
- Cada teste roda num contexto de navegador novo: `localStorage` próprio, portanto banco simulado próprio. Não há estado compartilhado entre testes.
- **CI** (`.github/workflows/ci.yml`): Node 24, `npm ci`, `npm run verify`, Chromium do Playwright com dependências do sistema e `npx playwright test` com a suíte completa, sem filtro de tags. O relatório HTML e os traces sobem como artefato, mesmo quando os testes falham (`if: !cancelled()`). O workflow não usa secrets.

## 8. Decisões

Cada item segue o formato: problema, escolha, alternativa descartada e motivo.

- **D1, versão do MSW:** o MSW 3.0.3 é o estável atual, mas o `@mswjs/socket.io-binding` 0.2.0 exige `msw ^2.10.2`. **Escolha:** MSW 2.15.0, a última 2.x. **Descartado:** MSW 3 com override de peer, porque o MSW 3 renomeou o evento `connection` e o binding não foi atualizado.
- **D2, match do handler Socket.IO:** **escolha:** `ws.link(origem)`, seguindo o comportamento do MSW para `/socket.io/`. **Descartado:** escrever um adaptador próprio, desnecessário depois que a causa foi encontrada.
- **D3, heartbeat no mock:** **escolha:** pings engine.io a cada 25 s no handler. **Descartado:** anunciar um `pingInterval` enorme, que exigiria reescrever o handshake do binding e esconderia o comportamento real do protocolo.
- **D4, import dinâmico do `socket.io-client`:** **escolha:** carregar sob demanda no módulo de tempo real. **Descartado:** carregar o app inteiro dinamicamente depois do MSW, o que somaria uma cascata de requisições ao carregamento inicial.
- **D5, `routeTree.gen.ts` versionado:** permite typecheck num checkout limpo sem rodar o plugin antes. **Descartado:** adicionar `@tanstack/router-cli` só para gerar o arquivo.
- **D6, `shadcn` em `devDependencies`:** o pacote só fornece o CLI e o `shadcn/tailwind.css`, um arquivo CSS resolvido no build, sem executar JavaScript do pacote. Com isso, `npm audit --omit=dev` fica com 0 vulnerabilidades. Isso **não** significa que o projeto está sem vulnerabilidades; veja a seção 9.
- **D7, sem retries no Playwright:** um teste instável deve ser corrigido na causa, não mascarado.
- **D8, zod para os contratos:** um schema serve de tipo, de validação no handler, de validação no formulário e de checagem da resposta no cliente. **Descartado:** tipos TypeScript soltos, que não validam nada em tempo de execução e deixariam handler e formulário divergirem.
- **D9, token opaco em vez de JWT:** o mock guarda só o SHA-256 do token e pode revogar a sessão no logout. **Descartado:** JWT assinado no navegador, porque a chave de assinatura ficaria no bundle e a assinatura não provaria nada.
- **D10, autenticação do socket pelo `auth` do CONNECT:** detalhes na seção 14. **Descartado:** token na query da URL.
- **D11, navegação imperativa ao perder a sessão:** o layout protegido navega num `useEffect` disparado uma vez por mudança de época. **Descartado:** o componente `<Navigate>`. Ele navega de novo a cada render com props novas e, enquanto a rota protegida continua montada durante a transição, isso virou um laço que travou a thread principal (o `page.evaluate` do Playwright não retornava). Reproduzido e corrigido na F1.
- **D12, modal de autenticação realmente modal:** no desktop, o modal prende o foco e torna o resto da página inerte, como pede o padrão de diálogo acessível. Consequência: o painel da demonstração fica inacessível com o modal aberto; para usá-lo, fecha-se o modal (X ou Esc). **Descartado:** `modal={false}`, que tiraria o foco preso só para facilitar a demonstração.

## 9. Resultados da F0

Execuções locais em 15/10/2026, Node 24.12, Chromium headless shell 156 (Playwright 1.64.1):

- `npm ci`: passou, sem alterar o `package-lock.json`.
- `npm run verify` (typecheck, lint, build): passou.
- `npm ci` + `npm run verify` numa cópia limpa do projeto, sem `node_modules`: passou.
- `npx playwright test`, suíte completa, desktop + mobile: **38 aprovados, 2 pulados, 0 falhas** (1,3 min). Os 2 pulados são o teste de versão do deploy (seção 7).
- `npm audit --omit=dev`: 0 vulnerabilidades nas dependências de produção.
- `npm audit` completo: **7 de severidade alta, todas só em desenvolvimento.** A origem é `braces@3.0.3` (GHSA-vfj7-8cjw-p6xm: negação de serviço por estouro de pilha com padrões glob muito aninhados), pela cadeia `shadcn` → (`@shadcn/registry`, `ts-morph` → `@ts-morph/common`) → `fast-glob` → `micromatch` → `braces`. O lockfile marca o `braces` como `dev: true`. Não há correção compatível: o advisory não tem versão corrigida, e o `npm audit fix --force` rebaixaria o `shadcn` para 1.0.0, incompatível com Tailwind 4. Impacto conhecido: só ao rodar o CLI do shadcn localmente com padrões glob de origem não confiável. Nada disso chega ao bundle, e o CI não executa o CLI. Vale reavaliar quando sair uma versão do shadcn com a cadeia atualizada.
- Prova de conceito do Socket.IO, local (desktop e mobile):
  - Evento recebido do mock, sem nenhum WebSocket de rede real visto pelo Playwright: passou. Quando o handler não casava, o Playwright registrava o WebSocket real; essa asserção prova que o worker interceptou a conexão.
  - Conexão estável por 65 s (1 conexão, 0 quedas): passou.
  - Reconexão após encerramento pelo servidor (motivo `transport close`, nova conexão, novo `system.hello`): passou.
- **Deploy na Vercel** ([nft-marketplace-iota-three.vercel.app](https://nft-marketplace-iota-three.vercel.app/)), commit `eac2426`. Comando: `npm run test:e2e:deploy` com `EXPECTED_COMMIT_SHA` definido.
  - Resultado: **40 aprovados, 0 falhas, 0 pulados** (1,2 min), desktop e mobile. Inclui a prova de conceito completa (estabilidade por 65 s e reconexão) e a checagem de que o build publicado é o commit esperado.
  - Conferido com `curl`: `mockServiceWorker.js` sai com `Cache-Control: no-cache, no-store, must-revalidate` e `Service-Worker-Allowed: /`, e rotas profundas respondem 200 pelo rewrite.
- **CI no GitHub** ([execução 38743865559](https://github.com/Henriqueverri/nft-marketplace/actions/runs/38743865559)), commit `eac2426`: sucesso em 2 min 38 s. Todas as etapas passaram, e o Playwright teve **38 aprovados e 2 pulados** (a checagem do commit do deploy, que precisa de `EXPECTED_COMMIT_SHA`).

## 10. Contratos e erros (F1)

Os schemas ficam em `src/contracts`, um arquivo por domínio: `common` (ids, datas ISO, valores em ETH como string decimal), `errors`, `account` (perfil público, conta e perfil privado), `auth` (cadastro, login, sessão), `catalog` (redes, coleções, edições e NFTs; usados pelo seed agora, endpoints na F2), `wallets`, `pagination` (`paginatedSchema(item)`, a partir da F2), `mock` (cenário e estado do mock) e `events`.

**Formato único de erro:** `{ "error": { "code", "message", "fieldErrors"? } }`. O código determina o status HTTP (`API_ERROR_STATUS`):

| Código | HTTP |
| --- | --- |
| `VALIDATION_FAILED` | 422 |
| `INVALID_CREDENTIALS`, `UNAUTHENTICATED`, `SESSION_EXPIRED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `EMAIL_TAKEN`, `USERNAME_TAKEN`, `CONFLICT` | 409 |
| `STORAGE_CORRUPTED`, `INTERNAL_ERROR` | 500 |
| `SERVICE_UNAVAILABLE` | 503 |
| `STORAGE_FULL` | 507 |

O cliente acrescenta códigos que não vêm do servidor: `NETWORK_ERROR`, `TIMEOUT`, `CANCELED`, `SESSION_CHANGED` e `UNEXPECTED_RESPONSE`.

**O que nunca sai numa resposta:** hash ou salt de senha, a própria senha, tokens de outras sessões. O token da sessão aparece uma única vez, na resposta de cadastro ou login. `GET /__mock/state` também não expõe credenciais nem tokens; um teste confere isso.

**Endpoints REST (MSW)**, todos sob o cenário de rede (seção 15):

| Método e rota | Sucesso | Erros principais |
| --- | --- | --- |
| `POST /api/auth/signup` | 201 `AuthSession` | 422, 409 `EMAIL_TAKEN`/`USERNAME_TAKEN` com `fieldErrors` |
| `POST /api/auth/login` | 200 `AuthSession` | 422, 401 `INVALID_CREDENTIALS` |
| `GET /api/auth/session` | 200 `CurrentSession` | 401 `UNAUTHENTICATED`/`SESSION_EXPIRED` |
| `POST /api/auth/logout` | 204 | 401 |
| `GET /api/account/profile` | 200 `AccountProfile` | 401 |
| `PATCH /api/account/profile` | 200 `AccountProfile` + evento `profile.updated` | 401, 422 |

Os handlers derivam o usuário **somente do token**; nenhuma rota aceita `userId` do cliente. Conflitos de cadastro são checados de novo dentro da transação, porque o hash da senha é assíncrono e outra aba pode ter criado a conta nesse intervalo.

## 11. Banco simulado e persistência (F1)

Responsabilidades separadas em `src/mocks/db/`:

- `seed.ts`: dados determinísticos (PRNG mulberry32 com semente fixa): 2 contas fictícias, 48 NFTs (os 9 primeiros vêm do Figma), coleções, redes e carteiras. Preços calculados em `bigint` (wei), sem ponto flutuante.
- `schema.ts`: o schema zod do estado persistido.
- `integrity.ts`: regras que o schema não expressa (ids, e-mails e usernames únicos, e-mail normalizado, uma credencial por usuário, sessões e carteiras apontando para usuários existentes, preço igual à edição mais barata, `available ≤ supply`).
- `storage.ts`: leitura e escrita no `localStorage` (`kurio:mock-db:v1`), com erros explícitos.
- `database.ts`: carga preguiçosa, `readDb()`, `transaction(mutate)` e `resetDb()`.

**Escrita transacional:** a transação clona o estado, aplica a mudança, valida o schema e a integridade, grava e só então troca a cópia em memória. Se qualquer passo falha, nada muda.

**Falhas de armazenamento nunca viram sucesso falso:**
- Cota cheia (`QuotaExceededError`) → `StorageFullError` → 507 `STORAGE_FULL`. O cadastro falha, a conta não é criada e a sessão não começa (teste com o `localStorage` preenchido até a cota).
- JSON inválido ou integridade quebrada na carga → 500 `STORAGE_CORRUPTED` em toda rota até o reset. O banco **não** é recriado em silêncio, para não apagar dados sem aviso. O painel mostra "corrompido".
- Versão de seed antiga → o banco é recriado a partir do seed novo.
- Um evento `storage` de outra aba invalida a cópia em memória.

**Senhas.** PBKDF2-SHA-256 via Web Crypto, **600.000 iterações** (recomendação OWASP para PBKDF2-SHA-256), salt aleatório de 16 bytes por senha, chave de 256 bits e comparação em tempo constante. Custo medido: cerca de 110 ms por hash no Chromium local. Para e-mail inexistente, o login compara com um hash fictício: mesma mensagem e tempo semelhante, para não revelar quais e-mails existem.

**Sessões.** Token opaco de 32 bytes aleatórios (base64url). O banco guarda só o SHA-256 do token; vazar o banco não vaza sessões utilizáveis. Validade de 8 h; logout revoga.

> **Isto é autenticação simulada.** Senha e banco ficam no navegador do próprio usuário, e qualquer script da página pode ler o `localStorage`. As medidas acima evitam guardar segredos em claro e reproduzem o comportamento esperado de um backend, mas **não equivalem à segurança de um servidor**. Em produção, hash e sessões ficariam no backend, e o token, num cookie `httpOnly` e `SameSite`.

## 12. Autenticação, sessão e rotas (F1)

- **Store da sessão** (`src/shared/session/session-store.ts`): `{ token, userId, epoch, endReason }`, persistido em `kurio:session`. A **época** muda em todo login, logout, expiração, reset ou troca de conta em outra aba. `start()` grava primeiro: se o storage falhar, a sessão não começa.
- **Queries de sessão** (`src/features/auth/queries.ts`): `['session']` pergunta à API quem é o usuário; sem token, nem pergunta. Login e cadastro iniciam a sessão e já gravam o usuário no cache.
- **Layout `_authenticated`** (`src/routes/_authenticated.tsx`): o `beforeLoad` confere a sessão na API (`fetchQuery`, que respeita `staleTime` e refaz se a query foi invalidada). Sem sessão, redireciona para `/login?redirect=<rota>` e acrescenta `reason=expired` quando foi expiração. Se a checagem falha por rede ou servidor, mostra um erro com "Tentar novamente". Quando a sessão acaba com o usuário já numa tela privada, o componente navega para `/login` (expiração) ou `/` (logout, reset) (D11).
- **Rotas privadas:** `/account/profile`, `/account/wallets`, `/account/favorites`, `/checkout` e `/orders/$orderId`. O carrinho continua público (visitante).
- **`/login` e `/signup`:** usuários já autenticados são mandados para o `redirect`. Se a checagem de sessão falha, o formulário continua disponível.
- **Redirect sem open redirect** (`src/features/auth/redirect.ts`): só caminhos relativos da mesma origem. `//host`, URLs absolutas, barra invertida e as próprias páginas de auth viram `/`. Testado com `//evil.example/roubo`, `https://evil.example` e `/\evil.example`.
- **Expiração:** o cenário `POST /__mock/session/expire` faz a sessão vencer no banco; a próxima requisição privada recebe um 401 real, o cliente encerra a sessão como `expired`, limpa o cache e leva ao login com o retorno preservado.
- **Rascunhos** (`src/shared/session/drafts.ts`): `sessionStorage`, chave `kurio:draft:<userId>:<nome>`. Expiração mantém o rascunho (o usuário retoma depois de entrar de novo); logout apaga os do usuário que saiu. Um rascunho só é lido para o mesmo `userId`.
- **Logout:** chama a API (revoga a sessão e fecha os sockets dela no servidor) e, mesmo se a chamada falhar, encerra a sessão local. Em seguida navega para `/` e anuncia "Você saiu da sua conta."

## 13. Isolamento entre sessões (F1)

Camadas independentes; cada uma sozinha já impede o vazamento mais comum:

1. **Servidor:** o usuário vem só do token. Não há rota que aceite `userId` do cliente.
2. **Chaves de query:** dados privados usam `['user', userId, ...]` (`privateQueryKey`).
3. **Limpeza síncrona:** `bindSessionToQueryClient` assina o store. Em qualquer troca de sessão, cancela as queries, apaga o cache de queries e as mutations já resolvidas (as variáveis podem conter dados privados), antes de qualquer render com a nova sessão. A mutation de login em andamento é preservada.
4. **Respostas atrasadas:** a época aborta as requisições em voo e descarta respostas que chegam depois da troca (`SESSION_CHANGED`). Testado com duas abas: a resposta de Ana, atrasada 2 s, chega depois que a outra aba trocou a sessão para Bruno, e o e-mail de Ana nunca aparece (observado por `MutationObserver`).
5. **Socket:** um socket por época, criado com `forceNew`; nunca se reaproveita a conexão de A para B (seção 14).
6. **Eventos:** o cliente descarta eventos privados cujo `userId` não é o da sessão atual e duplicatas por `eventId` (LRU de 500). O perfil só aplica uma atualização com `version` mais nova.
7. **Persistência local:** só o banco simulado (o "servidor") e o cenário ficam no `localStorage` depois do logout; o token sai, e os rascunhos do usuário são apagados.

O teste eliminatório (`isolation.spec.ts`) faz A entrar, alterar o perfil, deixar um rascunho e sair; B entra **sem refresh** (um marcador em `window` prova que o documento é o mesmo) e não vê e-mail, nome, rascunho nem username de A.

## 14. Autenticação do socket (F1)

**Leitura do binding** (0.2.0): ele confirma o CONNECT com `40{"sid":"test"}` por conta própria, num microtask, antes de ler o pacote do cliente, e só decodifica pacotes EVENT. O `auth` do `io(url, { auth })` nunca chega aos listeners do binding.

**Escolha:** o cliente envia o token no `auth` do CONNECT (`io(url, { auth: { token }, forceNew: true, transports: ['websocket'] })`). O token viaja dentro de um frame WebSocket, não na URL. O mock escuta a mensagem bruta do cliente (`raw.client.addEventListener('message')`), decodifica o `40{...}`, valida o token com a mesma função dos handlers REST e associa `userId` e `sessionId` à conexão, identificada pelo `raw.client.id` do MSW (nunca por `socket.id`, que é sempre `"test"`).

- Token inválido, sessão vencida ou namespace customizado: o mock envia `44{"message":"UNAUTHENTICATED"}` (CONNECT_ERROR). O `socket.io-client` destrói o socket e emite `connect_error`; o painel mostra "recusado", e o cliente pede à API REST que confirme a sessão. **Evidência:** teste com token forjado em nome de Ana e REST atrasado 3 s: o painel mostra "recusado" antes do 401 do REST, a identidade de Ana nunca aparece e nenhuma conexão fica associada a um usuário.
- Entre o `40` automático do binding e a validação, a conexão existe sem dono. Nesse intervalo o mock não envia nenhum evento privado, porque eventos privados só vão para conexões com dono (`emitToUser`) e sessão ativa.
- `system.hello` só sai depois da validação e informa `{ connectionId, userId }`.
- Uma recusa também desfaz uma associação anterior: se uma conexão já autenticada envia outro CONNECT com token inválido, ela volta a não ter dono.
- Logout fecha no servidor as conexões daquela sessão; reset fecha todas. No cliente, a limpeza do effect remove os listeners (`removeAllListeners`, `offAny`) antes do `disconnect`, e o socket seguinte é anônimo. Teste: depois do logout há uma conexão, com `userId: null`, as inscrições caem a 0 e um evento para Ana é entregue a 0 conexões.

**Descartado: token na query da URL do handshake.** Seria mais simples no mock (a URL chega no evento `connection`), mas URLs aparecem em logs de servidor e proxy, no histórico de ferramentas de rede e em cabeçalhos `Referer`; o token vazaria por canais que não são feitos para segredos. Além disso, um servidor Socket.IO real lê o `auth` nativamente, então a escolha atual não exige mudança no cliente quando o mock for trocado.

## 15. Painel de cenários e API de controle (F1)

O painel (`src/features/demo/DemoPanel.tsx`) substitui a barra de diagnóstico da F0, mantendo os mesmos `data-testid`. Mostra sessão, estado e identidade do socket, conexões, quedas, eventos aplicados e ignorados, inscrições, versão, cenário atual, estado do armazenamento, número de usuários e de sessões ativas. Controles: latência, falha da API, "Expirar sessão" e "Restaurar estado inicial".

Ele usa só a API de controle, via `mockControlHttp`; nunca toca o banco. A API existe apenas com `VITE_ENABLE_MOCKS=true`:

| Rota | Efeito |
| --- | --- |
| `GET /__mock/status` | mock ativo e número de conexões |
| `GET /__mock/state` | resumo sem segredos; funciona com o banco corrompido |
| `GET`/`PUT /__mock/scenario` | `{ latencyMs: 0..10000, failure: none \| server-error \| unavailable \| offline, realtimeClient?: available \| unavailable }`, persistido em `kurio:mock-scenario:v1` |
| `POST /__mock/reset` | seed, cenário padrão e fechamento de todos os sockets |
| `POST /__mock/session/expire` | vence as sessões ativas (opcional `{ userId }`) |
| `POST /__mock/socket/disconnect` | fecha todos os sockets |
| `GET /__mock/socket/connections` | conexões e seus donos |
| `POST /__mock/users/:userId/profile` | muda o nome no banco e emite `profile.updated` para o dono ou para todos (`delivery: broadcast`, simula um bug de roteamento) |

O cenário de rede vale só para `/api/*`; a API de controle nunca sofre atraso nem falha. `offline` responde com erro de rede (`HttpResponse.error()`).

**Falha ao carregar o cliente de tempo real.** O `socket.io-client` é carregado sob demanda a partir de `src/shared/realtime/socket-client.ts`, o que dá ao chunk um nome estável (`socket-client-<hash>.js`). Com `realtimeClient: 'unavailable'`, um handler do MSW (`src/mocks/assets.ts`) responde a esse chunk com erro de rede, como aconteceria depois de um deploy que removeu o chunk antigo; os demais arquivos estáticos seguem para a rede. A falha é do próprio `import()` do app, sem `page.route` e sem substituir o código real. O provider captura a rejeição e entra no estado `unavailable` ("indisponível" no painel): não há socket, os contadores ficam em zero e nada indica conexão. Um aviso `role=alert`, sem detalhes internos, explica que as atualizações automáticas estão indisponíveis e oferece "Tentar conectar novamente", que reinicia a tentativa (o estado é marcado por época da sessão e por tentativa). O Chromium refaz o `import()` depois de uma falha; o teste confirma a recuperação.

## 16. Telas de autenticação (F1)

Seguem os frames "Desktop / Login", "Desktop / Cadastro", "Mobile / Login" e "Mobile / Cadastro".

- **Desktop (≥ 768 px):** modal sobre a home, 500 px de largura, a 160 px do topo, abas "Entrar | Criar conta" como links de rota, barra laranja de 10 px na base e fundo sem escurecimento (o fundo do frame no Figma não tem preenchimento). Os valores literais do Figma foram mantidos, inclusive a inconsistência de raio (login 0, cadastro 8 px).
- **Mobile:** página própria, com logo "KURIO", sem o header provisório; campos de 50 px e botão de 60 px com raio 10. O placeholder centralizado do nome de usuário no cadastro mobile também é literal do Figma.
- **Acessibilidade:** o Figma usa só placeholders; cada campo tem um `label` visualmente oculto. Erros ficam em `aria-describedby`, com `aria-invalid` e foco no primeiro campo inválido. Erros gerais usam `role=alert`. O título do modal é um `h1` oculto. O foco inicial vai para o primeiro campo. Texto de erro em coral `#f0805f`, que contrasta melhor no fundo escuro que o vermelho `#ed1b2e` do Figma.
- **Fora do escopo da demonstração:** login social e "Esqueceu a senha?" mantêm a composição do Figma, mas avisam "indisponível na demonstração" num `role=status`, em vez de fingir que funcionam.
- **Substituição documentada:** o ícone de "mostrar senha" é o `Eye` do lucide, porque o Figma só tem o ícone de senha oculta (exportado de lá, junto com os ícones de Google, Facebook e fechar, por `scripts/export-figma-assets.mjs`).
- **Perfil provisório:** `/account/profile` já lê e altera dados privados reais (nome de exibição, com rascunho por usuário), porque os testes de isolamento dependem disso. A tela do Figma entra na F5.

## 17. Resultados da F1

Execuções locais em 15/10/2026, mesmo ambiente da F0:

- `npm run verify` (typecheck, lint, build): passou.
- `npx playwright test`, suíte completa (desktop + mobile, incluindo o teste de 65 s da F0): **90 aprovados, 2 pulados, 0 falhas** (2,2 min). Os 2 pulados continuam sendo a checagem do commit do deploy (seção 7). Por arquivo, contando os dois projetos: smoke 34, auth 24, mocks 14, isolation 12, realtime-poc 8 (inclui a falha de carregamento do cliente de tempo real).
- Bundle: o chunk inicial do app tem 238 kB (75 kB gzip); o zod entra num chunk compartilhado de 53 kB (20 kB gzip); o cliente de tempo real, carregado sob demanda, tem 31 kB (10 kB gzip). O chunk do MSW continua com cerca de 454 kB (169 kB gzip).
- **Validação remota pendente:** CI no GitHub e deploy na Vercel desta fase dependem do push.

## 18. Limitações e pendências

- As telas, exceto as de autenticação, são provisórias, e o header é temporário (F2).
- Autenticação simulada no navegador (seção 11): o token fica no `localStorage`, legível por scripts da página.
- Cada aba tem seu próprio servidor simulado. As abas compartilham o banco pelo `localStorage`, mas um evento emitido numa aba não chega aos sockets de outra.
- Com o modal de autenticação aberto no desktop, o painel da demonstração fica inerte (D12).
- A nova tentativa após falha do `import()` depende de o navegador refazer a importação de um módulo que falhou. O Chromium faz isso (verificado no teste); navegadores que guardam a falha no mapa de módulos só se recuperariam com recarga da página.
- **403:** o cliente trata `FORBIDDEN` como erro de autorização (mensagem própria, sem encerrar a sessão), mas nenhuma rota da F1 responde 403: todas as rotas privadas são do próprio usuário, identificado pelo token. O primeiro caso real de 403 (recurso de outro usuário, como um pedido) e o teste correspondente entram na F4.
- O motivo do fim da sessão não é compartilhado entre abas: se a sessão expira numa aba, a outra trata como logout (vai para a home e descarta os rascunhos daquela aba).
- Recuperação de senha e login social não existem na demonstração.
