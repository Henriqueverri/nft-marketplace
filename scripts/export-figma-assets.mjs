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
import sharp from 'sharp'

const FILE_KEY = 'uZ2cne4V9IX9LDhHxXFhBH'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Figma node id → output file. SVG keeps icons sharp and small. */
const assets = [
  { node: 'I70484:260;70483:242', format: 'svg', out: 'src/assets/icons/google.svg' },
  { node: 'I70484:240;70483:259', format: 'svg', out: 'src/assets/icons/facebook.svg' },
  { node: '9:963', format: 'svg', out: 'src/assets/icons/eye-hidden.svg' },
  { node: '9:947', format: 'svg', out: 'src/assets/icons/close.svg' },
  // Header (Desktop / Início)
  { node: 'I70522:3240;70504:3015;70486:519', format: 'svg', out: 'src/assets/icons/search.svg' },
  { node: 'I70522:3240;70504:3015;70486:521', format: 'svg', out: 'src/assets/icons/cart.svg' },
  { node: 'I70522:3240;70504:3015;70486:527', format: 'svg', out: 'src/assets/icons/login.svg' },
  // Catalog toolbar, pagination and promos
  { node: '4:152', format: 'svg', out: 'src/assets/icons/arrow-down.svg' },
  { node: '4:392', format: 'svg', out: 'src/assets/icons/chevron-right.svg' },
  { node: '5:99', format: 'svg', out: 'src/assets/icons/arrow-right.svg' },
  // NFT detail (Desktop / Detalhes do NFT)
  { node: '11:1195', format: 'svg', out: 'src/assets/icons/star.svg' },
  { node: '70410:3940', format: 'svg', out: 'src/assets/icons/heart.svg' },
  { node: '70410:3935', format: 'svg', out: 'src/assets/icons/zoom.svg' },
  { node: '70410:4192', format: 'svg', out: 'src/assets/icons/minus.svg' },
  { node: '70410:4196', format: 'svg', out: 'src/assets/icons/plus.svg' },
  { node: '11:1245', format: 'svg', out: 'src/assets/icons/share-linkedin.svg' },
  { node: '11:1248', format: 'svg', out: 'src/assets/icons/share-message.svg' },
  { node: '11:1247', format: 'svg', out: 'src/assets/icons/share-twitter.svg' },
  // Mobile frames (Início and Detalhes do NFT)
  { node: '15:5488', format: 'svg', out: 'src/assets/icons/filter.svg' },
  { node: '15:5519', format: 'svg', out: 'src/assets/icons/tab-home.svg' },
  { node: '15:5527', format: 'svg', out: 'src/assets/icons/tab-heart.svg' },
  { node: '15:5529', format: 'svg', out: 'src/assets/icons/tab-scan.svg' },
  { node: '15:5524', format: 'svg', out: 'src/assets/icons/tab-shop.svg' },
  { node: '15:5522', format: 'svg', out: 'src/assets/icons/tab-user.svg' },
  { node: '15:5745', format: 'svg', out: 'src/assets/icons/arrow-left.svg' },
  { node: '15:5642', format: 'svg', out: 'src/assets/icons/heart-solid.svg' },
  // Footer social links
  { node: 'I70492:696;70491:1270', format: 'svg', out: 'src/assets/icons/social-facebook.svg' },
  { node: 'I70492:696;70491:1272', format: 'svg', out: 'src/assets/icons/social-instagram.svg' },
  { node: 'I70492:696;70491:1274', format: 'svg', out: 'src/assets/icons/social-twitter.svg' },
  { node: 'I70492:696;70491:1276', format: 'svg', out: 'src/assets/icons/social-linkedin.svg' },
  { node: 'I70492:696;70491:1278', format: 'svg', out: 'src/assets/icons/social-youtube.svg' },
]

/**
 * The four NFT artworks are image fills (1254x1254 PNG, about 2 MB each). They are
 * re-encoded as WebP in a few widths, used through `srcset`, so no screen downloads
 * the original size.
 */
const artworks = [
  { imageRef: '8459204731e6eba9d474cbc8ebc37071360d3ba5', key: 'ape-sunglasses' },
  { imageRef: '2986a7cb16d09de8970824d2dd58bf0bb021702c', key: 'gorilla-hat' },
  { imageRef: '9df2ff42dd27ba657621c304557d1a855a4be6a5', key: 'gorilla-suit' },
  { imageRef: '87580f2def9af0ce13f4b6f6ce17bb2449bcfc16', key: 'monkey-headphones' },
]
const ARTWORK_WIDTHS = [320, 640, 960]

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

async function download(url, label) {
  const file = await fetch(url)
  if (!file.ok) throw new Error(`Download failed (${file.status}) for ${label}`)
  return Buffer.from(await file.arrayBuffer())
}

async function save(relativePath, data) {
  const target = join(root, relativePath)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, data)
}

const byFormat = Object.groupBy(assets, (asset) => asset.format)
for (const [format, group] of Object.entries(byFormat)) {
  const ids = group.map((asset) => asset.node).join(',')
  const { images, err } = await figma(`images/${FILE_KEY}?ids=${encodeURIComponent(ids)}&format=${format}`)
  if (err) throw new Error(`Figma render error: ${err}`)
  for (const asset of group) {
    const url = images[asset.node]
    if (!url) throw new Error(`Figma did not render node ${asset.node}`)
    await save(asset.out, await download(url, `node ${asset.node}`))
    console.log(`exported ${asset.node} -> ${asset.out}`)
  }
}

const { meta } = await figma(`files/${FILE_KEY}/images`)
for (const artwork of artworks) {
  const url = meta.images[artwork.imageRef]
  if (!url) throw new Error(`Figma has no image fill ${artwork.imageRef}`)
  const original = await download(url, `image fill ${artwork.key}`)
  for (const width of ARTWORK_WIDTHS) {
    const out = `src/assets/nfts/${artwork.key}-${width}.webp`
    await save(out, await sharp(original).resize(width, width).webp({ quality: 78 }).toBuffer())
    console.log(`exported ${artwork.key} -> ${out}`)
  }
}
