// Final F8 collection: 3 runs for every page/profile against a running optimized preview.
// Usage: npm run lighthouse [-- <base URL>]   (default http://localhost:4173)
// Start the preview with VITE_ENABLE_MOCKS=true and the default mock scenario.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const LIGHTHOUSE = 'lighthouse@13.5.0'
const RUNS = 3
const outDir = 'lighthouse'
const pages = [
  { name: 'home', path: '/' },
  { name: 'detail', path: '/nfts/emerald-ape-042' },
]
const presets = ['mobile', 'desktop']
const categories = { performance: 90, accessibility: 95, 'best-practices': 95, seo: 90 }

const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}
const usage = () => { throw new Error('Uso: --collection <id> --page <home|detail> --preset <mobile|desktop> <URL>; ou --collection <id> --summary') }
const collection = option('--collection')
const isSummary = args.includes('--summary')
const pageName = option('--page')
const preset = option('--preset')
const flags = new Set(['--collection', '--page', '--preset'])
const positional = args.filter((arg, index) => !arg.startsWith('--') && !flags.has(args[index - 1]))
if (!collection || !/^f8-[a-zA-Z0-9-]+$/.test(collection)) usage()
if (isSummary ? pageName || preset || positional.length : !pageName || !preset || positional.length != 1) usage()
if (!isSummary && (!pages.some((page) => page.name === pageName) || !presets.includes(preset))) usage()
const base = positional[0]?.replace(/\/$/, '')
const collectionDir = join(outDir, collection)

const median = (values) => {
  if (values.length !== RUNS || values.some((value) => !Number.isFinite(value))) throw new Error('Métricas incompletas ou inválidas.')
  return [...values].sort((a, b) => a - b)[1]
}

const parse = (path) => {
  const report = JSON.parse(readFileSync(path, 'utf8'))
  if (report.finalUrl !== report.requestedUrl) throw new Error(`URL final inválida em ${path}: ${report.finalUrl}`)
  if (report.runWarnings?.length) throw new Error(`Lighthouse registrou avisos em ${path}: ${report.runWarnings.join('; ')}`)
  const score = (id) => {
    const value = report.categories?.[id]?.score
    if (!Number.isFinite(value)) throw new Error(`Categoria ausente: ${id}`)
    return value * 100
  }
  const metric = (id) => {
    const value = report.audits?.[id]?.numericValue
    if (!Number.isFinite(value)) throw new Error(`Métrica ausente: ${id}`)
    return value
  }
  return { report, scores: Object.fromEntries(Object.keys(categories).map((id) => [id, score(id)])), metrics: { lcp: metric('largest-contentful-paint'), cls: metric('cumulative-layout-shift'), tbt: metric('total-blocking-time') } }
}

const fmt = (value, digits = 0) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)
const summary = (runs) => {
  if (runs.length !== 12) throw new Error(`Coleta incompleta: ${runs.length} de 12 medições.`)
  const first = runs[0].report
  const rows = pages.flatMap((page) => presets.map((preset) => {
    const group = runs.filter((run) => run.page === page.name && run.preset === preset)
    return { page: page.name, preset, performance: median(group.map((run) => run.scores.performance)), accessibility: median(group.map((run) => run.scores.accessibility)), best: median(group.map((run) => run.scores['best-practices'])), seo: median(group.map((run) => run.scores.seo)), lcp: median(group.map((run) => run.metrics.lcp)), cls: median(group.map((run) => run.metrics.cls)), tbt: median(group.map((run) => run.metrics.tbt)) }
  }))
  const table = rows.map((row) => `| ${row.page} | ${row.preset} | ${fmt(row.performance)} | ${fmt(row.accessibility)} | ${fmt(row.best)} | ${fmt(row.seo)} | ${fmt(row.lcp / 1000, 2)} s | ${fmt(row.cls, 3)} | ${fmt(row.tbt)} ms |`).join('\n')
  const artifacts = runs.map((run) => `- ${run.page}/${run.preset}/rodada-${run.round}: \`${run.json}\` e \`${run.html}\``).join('\n')
  return `# Lighthouse — F8\n\nColeção: \`${collection}\`  \nExecutada em: ${new Date().toISOString()}  \nURL de preview: ${new URL(first.requestedUrl).origin}  \nNode: ${process.version}  \nLighthouse: ${first.lighthouseVersion} (solicitado: ${LIGHTHOUSE})  \nNavegador host: ${first.environment?.hostUserAgent ?? 'não informado'}  \nCenário de mocks: padrão, com \`VITE_ENABLE_MOCKS=true\`; sem latência ou falha deliberada.\n\n## Condições\n\n- Build otimizado servido por preview; a URL acima deve apontar para esse preview.\n- Home (\`/\`) e detalhe (\`/nfts/emerald-ape-042\`), nos presets mobile e desktop.\n- Três rodadas sequenciais por combinação; cada rodada preserva HTML e JSON próprios.\n- Metas: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95 e SEO ≥ 90.\n\n## Medianas das 3 rodadas\n\n| Página | Perfil | Performance (≥90) | Accessibility (≥95) | Best Practices (≥95) | SEO (≥90) | LCP | CLS | TBT |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${table}\n\n## Artefatos\n\n${artifacts}\n\n## Nota sobre relatórios históricos\n\nOs oito arquivos diretamente em \`lighthouse/\` (quatro HTML e quatro JSON sem o prefixo \`${collection}\`) são resultados históricos da F2. Eles não compõem a amostra final da F8.\n\n## Pendências residuais da F7\n\nA suíte repetida da F7 revelou falhas que foram apenas parcialmente investigadas; este resumo não as declara resolvidas. A documentação atual também registra ausência de exportações de referência em \`docs/figma-reference/\` para a comparação visual das quatro telas prioritárias.\n`
}

try {
  if (isSummary) {
    const summaryPath = join(collectionDir, 'summary.md')
    if (existsSync(summaryPath)) throw new Error(`Resumo já existe: ${summaryPath}`)
    const runs = []
    for (const page of pages) for (const profile of presets) for (let round = 1; round <= RUNS; round += 1) {
      const output = join(collectionDir, `${page.name}-${profile}-run-${round}`)
      const json = `${output}.report.json`
      const html = `${output}.report.html`
      if (!existsSync(json) || !existsSync(html)) throw new Error(`Artefato ausente: ${page.name}/${profile}/rodada-${round}`)
      runs.push({ ...parse(json), page: page.name, preset: profile, round, json, html })
    }
    writeFileSync(summaryPath, summary(runs), 'utf8')
    console.log(`Resumo F8 escrito em ${summaryPath}.`)
  } else {
    mkdirSync(collectionDir, { recursive: true })
    const page = pages.find((item) => item.name === pageName)
    for (let round = 1; round <= RUNS; round += 1) {
      const output = join(collectionDir, `${page.name}-${preset}-run-${round}`)
      const json = `${output}.report.json`
      const html = `${output}.report.html`
      if (existsSync(json) || existsSync(html)) throw new Error(`Artefato já existe: ${page.name}/${preset}/rodada-${round}; use outra coleção.`)
      console.log(`F8 ${collection}: ${page.name} (${preset}), rodada ${round}/${RUNS}`)
      execFileSync('npx', ['--yes', LIGHTHOUSE, `${base}${page.path}`, ...(preset === 'desktop' ? ['--preset=desktop'] : []), '--quiet', '--chrome-flags=--headless=new', '--output=json', '--output=html', `--output-path=${output}`], { stdio: ['ignore', 'inherit', 'inherit'] })
      if (!existsSync(json) || !existsSync(html)) throw new Error(`Rodada sem HTML e JSON: ${page.name}/${preset}/${round}`)
      parse(json)
    }
    console.log(`Lote concluído: ${page.name}/${preset}, 3 medições em ${collectionDir}/.`)
  }
} catch (error) {
  console.error(`F8 interrompida: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
