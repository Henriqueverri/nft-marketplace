# Kurio — Marketplace de NFTs

Implementação do desafio frontend da Jungle Gaming (enunciado em [`docs/challenge.md`](docs/challenge.md)), com React, TypeScript, TanStack Router, TanStack Query, Axios, Socket.IO, Tailwind CSS, shadcn/ui, MSW e Playwright.

> **Status: Fase F0 (fundação).** As telas ainda são provisórias. Esta fase entrega a base do projeto, o deploy, os testes iniciais e a prova de conceito de Socket.IO sobre MSW. Decisões e limitações estão em [`ARCHITECTURE.md`](ARCHITECTURE.md).

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

O comando de auditoria Lighthouse será adicionado na fase de performance.

### Testar o deploy

```bash
PLAYWRIGHT_BASE_URL=https://<sua-url>.vercel.app \
EXPECTED_COMMIT_SHA=$(git rev-parse HEAD) \
npm run test:e2e:deploy
```

## Mocks (estado na F0)

O MSW é iniciado antes da renderização e intercepta HTTP e WebSocket na própria página. Os endpoints de controle disponíveis nesta fase:

- `GET /__mock/status`: confirma que o mock responde e informa quantas conexões Socket.IO estão ativas.
- `POST /__mock/socket/disconnect`: o servidor simulado encerra as conexões Socket.IO, para exercitar a reconexão.

Exemplo, no console do navegador com a aplicação aberta:

```js
await (await fetch('/__mock/socket/disconnect', { method: 'POST' })).json()
```

A barra "Diagnóstico da demonstração", no rodapé, mostra o estado dos mocks, da conexão em tempo real, contadores de conexões e quedas, e a versão (commit) publicada.

Cenários, seleção, persistência, reset e credenciais fictícias chegam na F1.

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
  contracts/    contratos compartilhados por app, mocks e testes
  routes/       rotas do TanStack Router (file-based)
  shared/       api (Axios), realtime (Socket.IO), layout
  components/   componentes shadcn/ui
  mocks/        MSW: handlers HTTP, servidor Socket.IO simulado, controle
e2e/            testes Playwright
```
