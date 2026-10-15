import type { Collection, Edition, Network, Nft } from '@/contracts/catalog'
import type { Wallet } from '@/contracts/wallets'
import { formatEth, minEth, parseEth } from '@/lib/eth'
import { hashPassword } from './password'
import { DB_SCHEMA_VERSION, type CredentialRecord, type DbState, type UserRecord } from './schema'

/**
 * Deterministic seed. Bump SEED_VERSION whenever the fixtures change: a persisted
 * database from an older seed is replaced on load.
 *
 * Everything is reproducible except the password salts, which are random by design
 * (they are generated when the seed is materialized, on first load and on reset).
 */
export const SEED_VERSION = 1

/** Fictitious demo accounts (documented in the README). */
export const SEED_ACCOUNTS = [
  {
    id: 'usr_ana',
    username: 'ana.coleciona',
    email: 'ana@kurio.test',
    displayName: 'Ana Costa',
    password: 'kurio-ana-2026',
  },
  {
    id: 'usr_bruno',
    username: 'bruno.lima',
    email: 'bruno@kurio.test',
    displayName: 'Bruno Lima',
    password: 'kurio-bruno-2026',
  },
] as const

const REFERENCE_TIME = Date.parse('2026-09-01T12:00:00.000Z')
const DAY_MS = 86_400_000

/** mulberry32: small, fast and fully deterministic for a given seed. */
function createRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

const networks: Network[] = [
  { id: 'ethereum', name: 'Ethereum', currency: 'ETH', explorerUrl: 'https://etherscan.io' },
  { id: 'polygon', name: 'Polygon', currency: 'POL', explorerUrl: 'https://polygonscan.com' },
  { id: 'solana', name: 'Solana', currency: 'SOL', explorerUrl: 'https://solscan.io' },
]

/** The nine categories of the Figma "Coleções" filter. */
const collections: Collection[] = [
  { id: 'col_arte-digital', name: 'Arte digital' },
  { id: 'col_fotografia', name: 'Fotografia' },
  { id: 'col_musica', name: 'Música' },
  { id: 'col_arte-3d', name: 'Arte 3D' },
  { id: 'col_colecionaveis', name: 'Colecionáveis' },
  { id: 'col_generativa', name: 'Generativa' },
  { id: 'col_jogos', name: 'Jogos' },
  { id: 'col_assinaturas', name: 'Assinaturas' },
  { id: 'col_utilidade', name: 'Utilidade' },
]

type ImageKey = Nft['imageKey']

/** The nine NFTs shown in the Figma catalog, with their names, prices and artwork. */
const figmaNfts: { name: string; price: string; compareAt?: string; image: ImageKey; rare?: true }[] = [
  { name: 'Emerald Ape #042', price: '1.19', image: 'monkey-headphones' },
  { name: 'Sage Nomad #009', price: '1.69', image: 'gorilla-suit' },
  { name: 'Neon Vessel #552', price: '1.99', compareAt: '2.29', image: 'ape-sunglasses', rare: true },
  { name: 'Cosmic Bloom #118', price: '1.29', image: 'gorilla-hat' },
  { name: 'Violet Nomad #314', price: '1.39', image: 'monkey-headphones' },
  { name: 'Ivory Baron #088', price: '1.79', image: 'gorilla-suit' },
  { name: 'Golden Beat #207', price: '0.99', image: 'ape-sunglasses' },
  { name: 'Golden Frequency #071', price: '0.59', image: 'gorilla-hat' },
  { name: 'Golden Signal #160', price: '0.39', image: 'monkey-headphones' },
]

const nameAdjectives = ['Amber', 'Crimson', 'Silent', 'Lunar', 'Velvet', 'Rusty', 'Electric', 'Hidden']
const nameNouns = ['Monk', 'Drifter', 'Pilot', 'Oracle', 'Rider', 'Keeper', 'Echo', 'Relic']
const imageKeys: ImageKey[] = ['ape-sunglasses', 'gorilla-hat', 'monkey-headphones', 'gorilla-suit']
const creators = ['studio.ocre', 'lia.pixels', 'marco.render', 'kurio.labs']
const NFT_COUNT = 48

function slugify(name: string): string {
  return name.toLowerCase().replace(/#/g, '').trim().replace(/\s+/g, '-')
}

const EDITION_PRICE_STEP_WEI = parseEth('0.35')

function buildEditions(slug: string, basePrice: string, random: () => number): Edition[] {
  const editionCount = 1 + Math.floor(random() * 3)
  const baseWei = parseEth(basePrice)
  const editions: Edition[] = []
  const names = ['Edição padrão', 'Edição de colecionador', 'Edição 1/1']
  for (let index = 0; index < editionCount; index++) {
    const supply = index === 2 ? 1 : 5 + Math.floor(random() * 46)
    // Roughly one edition in six is sold out, to exercise unavailable editions.
    const available = random() < 0.16 ? 0 : 1 + Math.floor(random() * supply)
    editions.push({
      id: `ed_${slug}-${index + 1}`,
      name: names[index],
      priceEth: formatEth(baseWei + BigInt(index) * EDITION_PRICE_STEP_WEI),
      supply,
      available: Math.min(available, supply),
      maxPerOrder: index === 2 ? 1 : 2 + Math.floor(random() * 4),
    })
  }
  return editions
}

function buildNfts(): Nft[] {
  const random = createRandom(20_261_015)
  const nfts: Nft[] = []

  for (let index = 0; index < NFT_COUNT; index++) {
    const figma = figmaNfts[index]
    const generatedName = `${nameAdjectives[index % 8]} ${nameNouns[Math.floor(index / 6) % 8]} #${String(
      100 + index * 7,
    ).padStart(3, '0')}`
    const name = figma?.name ?? generatedName
    const slug = slugify(name)
    // One NFT is priced at exactly 0.1 ETH to exercise decimal precision (0.1 x 3 = 0.3).
    const randomCents = 20 + Math.floor(random() * 380)
    const basePrice =
      figma?.price ?? (index === 20 ? '0.1' : formatEth(BigInt(randomCents) * parseEth('0.01')))
    // The first edition carries the reference price, so listed prices match Figma.
    const editions = buildEditions(slug, basePrice, random)

    nfts.push({
      id: slug,
      name,
      tokenId: name.split('#')[1] ?? String(index),
      description: `${name} faz parte de uma série de retratos digitais com edições limitadas e verificadas.`,
      collectionId: collections[index % collections.length].id,
      networkId: networks[index % networks.length].id,
      creatorUsername: creators[index % creators.length],
      imageKey: figma?.image ?? imageKeys[index % imageKeys.length],
      rarity: figma?.rare || random() < 0.15 ? 'rare' : 'common',
      priceEth: minEth(editions.map((edition) => edition.priceEth)),
      compareAtPriceEth: figma?.compareAt ?? null,
      editions,
      listedAt: new Date(REFERENCE_TIME - index * DAY_MS).toISOString(),
      version: 1,
    })
  }
  return nfts
}

function buildWallets(): Record<string, Wallet[]> {
  return {
    usr_ana: [
      {
        id: 'wal_ana1',
        slot: 'primary',
        displayName: 'Ana Costa',
        nickname: 'Carteira principal da Ana',
        networkId: 'ethereum',
        address: '0x4a1f9c2b7e3d5a6b8c9d0e1f2a3b4c5d6e7f8a9b',
        provider: 'metamask',
        ensName: 'anacosta.eth',
      },
      {
        id: 'wal_ana2',
        slot: 'secondary',
        displayName: 'Ana Costa',
        nickname: 'Reserva Polygon',
        networkId: 'polygon',
        address: '0x9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a',
        provider: 'walletconnect',
        ensName: null,
      },
    ],
    usr_bruno: [
      {
        id: 'wal_bruno1',
        slot: 'primary',
        displayName: 'Bruno Lima',
        nickname: 'Cofre do Bruno',
        networkId: 'ethereum',
        address: '0x1234abcd5678ef901234abcd5678ef901234abcd',
        provider: 'coinbase',
        ensName: null,
      },
    ],
  }
}

function buildUsers(): UserRecord[] {
  return SEED_ACCOUNTS.map((account, index) => ({
    id: account.id,
    username: account.username,
    email: account.email,
    displayName: account.displayName,
    ensName: index === 0 ? 'anacosta.eth' : null,
    walletNickname: index === 0 ? 'Carteira principal da Ana' : 'Cofre do Bruno',
    avatarUrl: null,
    createdAt: new Date(REFERENCE_TIME - (30 - index) * DAY_MS).toISOString(),
    profileVersion: 1,
  }))
}

/** Seed without credentials: synchronous and byte-for-byte reproducible. */
export function buildSeedData(): Omit<DbState, 'credentials'> {
  return {
    schemaVersion: DB_SCHEMA_VERSION,
    seedVersion: SEED_VERSION,
    users: buildUsers(),
    sessions: [],
    walletsByUser: buildWallets(),
    networks,
    collections,
    nfts: buildNfts(),
  }
}

export async function createSeedState(): Promise<DbState> {
  const credentials: CredentialRecord[] = await Promise.all(
    SEED_ACCOUNTS.map(async (account) => ({ userId: account.id, ...(await hashPassword(account.password)) })),
  )
  return { ...buildSeedData(), credentials }
}
