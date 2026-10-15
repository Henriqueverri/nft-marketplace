#!/usr/bin/env node
/**
 * Exports assets from the Kurio Figma file into src/assets.
 *
 * Usage: node --env-file=.env.local scripts/export-figma-assets.mjs
 *
 * FIGMA_TOKEN is a personal, read-only token kept in .env.local (git-ignored).
 * It is sent only to api.figma.com and is never printed or written anywhere.
 * The exported files are committed, so builds never need the token.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FILE_KEY = 'uZ2cne4V9IX9LDhHxXFhBH'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Figma node id → output file. SVG keeps icons sharp and small. */
const assets = [
  { node: 'I70484:260;70483:242', format: 'svg', out: 'src/assets/icons/google.svg' },
  { node: 'I70484:240;70483:259', format: 'svg', out: 'src/assets/icons/facebook.svg' },
  { node: '9:963', format: 'svg', out: 'src/assets/icons/eye-hidden.svg' },
  { node: '9:947', format: 'svg', out: 'src/assets/icons/close.svg' },
]

const token = process.env.FIGMA_TOKEN
if (!token) {
  console.error('FIGMA_TOKEN is not set. Run with: node --env-file=.env.local scripts/export-figma-assets.mjs')
  process.exit(1)
}

async function figma(path) {
  const response = await fetch(`https://api.figma.com/v1/${path}`, { headers: { 'X-Figma-Token': token } })
  if (!response.ok) throw new Error(`Figma API ${response.status} for ${path.split('?')[0]}`)
  return response.json()
}

const byFormat = Object.groupBy(assets, (asset) => asset.format)
for (const [format, group] of Object.entries(byFormat)) {
  const ids = group.map((asset) => asset.node).join(',')
  const { images, err } = await figma(`images/${FILE_KEY}?ids=${encodeURIComponent(ids)}&format=${format}`)
  if (err) throw new Error(`Figma render error: ${err}`)
  for (const asset of group) {
    const url = images[asset.node]
    if (!url) throw new Error(`Figma did not render node ${asset.node}`)
    const file = await fetch(url)
    if (!file.ok) throw new Error(`Download failed (${file.status}) for node ${asset.node}`)
    const target = join(root, asset.out)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, Buffer.from(await file.arrayBuffer()))
    console.log(`exported ${asset.node} -> ${asset.out}`)
  }
}
