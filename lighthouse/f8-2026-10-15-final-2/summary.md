# Lighthouse — F8

- Coleção: `f8-2026-10-15-final-2`
- Executada em: 2026-10-15T23:52:57.525Z
- URL de preview: http://127.0.0.1:4175
- Node: v24.12.0
- Lighthouse: 13.5.0 (solicitado: lighthouse@13.5.0)
- Navegador host: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36
- Cenário de mocks: padrão, com `VITE_ENABLE_MOCKS=true`; sem latência ou falha deliberada.

## Condições

- Build otimizado servido por preview; a URL acima deve apontar para esse preview.
- Home (`/`) e detalhe (`/nfts/emerald-ape-042`), nos presets mobile e desktop.
- Três rodadas sequenciais por combinação; cada rodada preserva HTML e JSON próprios.
- Metas: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95 e SEO ≥ 90.

## Medianas das 3 rodadas

| Página | Perfil | Performance (≥90) | Accessibility (≥95) | Best Practices (≥95) | SEO (≥90) | LCP | CLS | TBT |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| home | mobile | 70 | 100 | 100 | 100 | 5,11 s | 0,000 | 155 ms |
| home | desktop | 97 | 100 | 100 | 100 | 1,11 s | 0,004 | 11 ms |
| detail | mobile | 71 | 100 | 100 | 100 | 4,90 s | 0,000 | 151 ms |
| detail | desktop | 97 | 100 | 100 | 100 | 1,06 s | 0,000 | 0 ms |

## Artefatos

- home/mobile/rodada-1: `lighthouse/f8-2026-10-15-final-2/home-mobile-run-1.report.json` e `lighthouse/f8-2026-10-15-final-2/home-mobile-run-1.report.html`
- home/mobile/rodada-2: `lighthouse/f8-2026-10-15-final-2/home-mobile-run-2.report.json` e `lighthouse/f8-2026-10-15-final-2/home-mobile-run-2.report.html`
- home/mobile/rodada-3: `lighthouse/f8-2026-10-15-final-2/home-mobile-run-3.report.json` e `lighthouse/f8-2026-10-15-final-2/home-mobile-run-3.report.html`
- home/desktop/rodada-1: `lighthouse/f8-2026-10-15-final-2/home-desktop-run-1.report.json` e `lighthouse/f8-2026-10-15-final-2/home-desktop-run-1.report.html`
- home/desktop/rodada-2: `lighthouse/f8-2026-10-15-final-2/home-desktop-run-2.report.json` e `lighthouse/f8-2026-10-15-final-2/home-desktop-run-2.report.html`
- home/desktop/rodada-3: `lighthouse/f8-2026-10-15-final-2/home-desktop-run-3.report.json` e `lighthouse/f8-2026-10-15-final-2/home-desktop-run-3.report.html`
- detail/mobile/rodada-1: `lighthouse/f8-2026-10-15-final-2/detail-mobile-run-1.report.json` e `lighthouse/f8-2026-10-15-final-2/detail-mobile-run-1.report.html`
- detail/mobile/rodada-2: `lighthouse/f8-2026-10-15-final-2/detail-mobile-run-2.report.json` e `lighthouse/f8-2026-10-15-final-2/detail-mobile-run-2.report.html`
- detail/mobile/rodada-3: `lighthouse/f8-2026-10-15-final-2/detail-mobile-run-3.report.json` e `lighthouse/f8-2026-10-15-final-2/detail-mobile-run-3.report.html`
- detail/desktop/rodada-1: `lighthouse/f8-2026-10-15-final-2/detail-desktop-run-1.report.json` e `lighthouse/f8-2026-10-15-final-2/detail-desktop-run-1.report.html`
- detail/desktop/rodada-2: `lighthouse/f8-2026-10-15-final-2/detail-desktop-run-2.report.json` e `lighthouse/f8-2026-10-15-final-2/detail-desktop-run-2.report.html`
- detail/desktop/rodada-3: `lighthouse/f8-2026-10-15-final-2/detail-desktop-run-3.report.json` e `lighthouse/f8-2026-10-15-final-2/detail-desktop-run-3.report.html`

## Nota sobre relatórios históricos

Os oito arquivos diretamente em `lighthouse/` (quatro HTML e quatro JSON sem o prefixo `f8-2026-10-15-final-2`) são resultados históricos da F2. Eles não compõem a amostra final da F8.

## Pendências residuais da F7

A suíte repetida da F7 revelou falhas que foram apenas parcialmente investigadas; este resumo não as declara resolvidas. A documentação atual também registra ausência de exportações de referência em `docs/figma-reference/` para a comparação visual das quatro telas prioritárias.
