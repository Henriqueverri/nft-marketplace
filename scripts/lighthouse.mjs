// Lighthouse probe of the home and an NFT detail, mobile and desktop presets, against
// a running build (`npm run build && npm run preview`) with the mocks on, as deployed.
// Usage: npm run lighthouse [-- <base URL>]   (default http://localhost:4173)
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'

const LIGHTHOUSE = 'lighthouse@13.5.0'
const base = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '')
const outDir = 'lighthouse'
const pages = [
  { name: 'home', path: '/' },
  { name: 'detail', path: '/nfts/emerald-ape-042' },
]
const presets = ['mobile', 'desktop']

mkdirSync(outDir, { recursive: true })
for (const page of pages) {
  for (const preset of presets) {
    const output = `${outDir}/${page.name}-${preset}`
    execFileSync(
      'npx',
      [
        '--yes',
        LIGHTHOUSE,
        `${base}${page.path}`,
        ...(preset === 'desktop' ? ['--preset=desktop'] : []),
        '--quiet',
        '--chrome-flags=--headless=new',
        '--output=json',
        '--output=html',
        `--output-path=${output}`,
      ],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    )
    const report = JSON.parse(readFileSync(`${output}.report.json`, 'utf8'))
    const scores = Object.entries(report.categories)
      .map(([id, category]) => `${id} ${Math.round(category.score * 100)}`)
      .join(', ')
    const metric = (id) => report.audits[id].displayValue
    console.log(
      `${page.name} (${preset}): ${scores} | FCP ${metric('first-contentful-paint')}, LCP ${metric('largest-contentful-paint')}, TBT ${metric('total-blocking-time')}, CLS ${metric('cumulative-layout-shift')}`,
    )
  }
}
console.log(`Relatórios em ${outDir}/ (HTML e JSON).`)
