import type { Collection, Edition, Network, Nft, Review } from '@/contracts/catalog'
import type { Wallet } from '@/contracts/wallets'
import { formatEth, minEth, parseEth } from '@/lib/eth'
import { hashPassword } from './password'
import {
  DB_SCHEMA_VERSION,
  type CredentialRecord,
  type DbState,
  type FavoriteRecord,
  type UserRecord,
} from './schema'

/**
 * Deterministic seed. Bump SEED_VERSION whenever the fixtures change: a persisted
 * database from an older seed is replaced on load.
 *
 * Everything is reproducible except the password salts, which are random by design
 * (they are generated when the seed is materialized, on first load and on reset).
 */
export const SEED_VERSION = 5

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
const figmaNfts: {
  name: string
  price: string
  compareAt?: string
  image: ImageKey
  rare?: true
  attributes?: string[]
  description?: string
}[] = [
  {
    name: 'Emerald Ape #042',
    price: '1.19',
    image: 'ape-sunglasses',
    rare: true,
    attributes: ['Óculos', 'Esmeralda', 'Raro'],
    description:
      'Um colecionável digital finalizado à mão da coleção Kurio Editions, verificado na Ethereum, com arte desbloqueável e acesso para colecionadores.',
  },
  { name: 'Sage Nomad #009', price: '1.69', image: 'gorilla-hat' },
  { name: 'Neon Vessel #552', price: '1.99', compareAt: '2.29', image: 'gorilla-suit', rare: true },
  { name: 'Cosmic Bloom #118', price: '1.29', image: 'gorilla-hat' },
  { name: 'Violet Nomad #314', price: '1.39', image: 'gorilla-hat' },
  { name: 'Ivory Baron #088', price: '1.79', image: 'gorilla-suit' },
  { name: 'Golden Beat #207', price: '0.99', image: 'monkey-headphones' },
  { name: 'Golden Frequency #071', price: '0.59', image: 'monkey-headphones' },
  { name: 'Golden Signal #160', price: '0.39', image: 'monkey-headphones' },
]

const nameAdjectives = ['Amber', 'Crimson', 'Silent', 'Lunar', 'Velvet', 'Rusty', 'Electric', 'Hidden']
const nameNouns = ['Monk', 'Drifter', 'Pilot', 'Oracle', 'Rider', 'Keeper', 'Echo', 'Relic']
const imageKeys: ImageKey[] = ['ape-sunglasses', 'gorilla-hat', 'monkey-headphones', 'gorilla-suit']
const accessoryByImage: Record<ImageKey, string> = {
  'ape-sunglasses': 'Óculos',
  'gorilla-hat': 'Chapéu',
  'monkey-headphones': 'Fones',
  'gorilla-suit': 'Terno',
}
const tones = ['Esmeralda', 'Âmbar', 'Violeta', 'Dourado', 'Marfim', 'Neon', 'Cobre']
const creators = ['studio.ocre', 'lia.pixels', 'marco.render', 'kurio.labs']
const NFT_COUNT = 48

function slugify(name: string): string {
  return name.toLowerCase().replace(/#/g, '').trim().replace(/\s+/g, '-')
}

const EDITION_PRICE_STEP_WEI = parseEth('0.35')

/**
 * Edition tiers of the Figma ("1/1", "1/10", "1/50", "Aberta"), from the most to the
 * least exclusive. The open edition is the cheapest and carries the listed price.
 */
const editionTiers = [
  { key: 'unique', name: '1/1', supply: 1, steps: 3 },
  { key: 'ten', name: '1/10', supply: 10, steps: 2 },
  { key: 'fifty', name: '1/50', supply: 50, steps: 1 },
  { key: 'open', name: 'Aberta', supply: 500, steps: 0 },
] as const

function buildEditions(slug: string, basePrice: string, tierCount: number, random: () => number): Edition[] {
  const baseWei = parseEth(basePrice)
  return editionTiers.slice(editionTiers.length - tierCount).map((tier) => {
    // Roughly one edition in six is sold out, to exercise unavailable editions.
    const available = tier.steps > 0 && random() < 0.16 ? 0 : 1 + Math.floor(random() * tier.supply)
    return {
      id: `ed_${slug}-${tier.key}`,
      name: tier.name,
      priceEth: formatEth(baseWei + BigInt(tier.steps) * EDITION_PRICE_STEP_WEI),
      supply: tier.supply,
      available: Math.min(available, tier.supply),
      maxPerOrder: tier.supply === 1 ? 1 : 2 + Math.floor(random() * 4),
    }
  })
}

function hexAddress(random: () => number): string {
  let hex = ''
  while (hex.length < 40) hex += Math.floor(random() * 16).toString(16)
  return `0x${hex}`
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
    // The Figma NFTs offer every tier; the others one to four of them.
    const editions = buildEditions(slug, basePrice, figma ? 4 : 1 + Math.floor(random() * 4), random)
    const imageKey = figma?.image ?? imageKeys[index % imageKeys.length]
    const rarity = figma?.rare || (!figma && random() < 0.15) ? 'rare' : 'common'

    nfts.push({
      id: slug,
      name,
      tokenId: name.split('#')[1] ?? String(index),
      description:
        figma?.description ?? `${name} faz parte de uma série de retratos digitais com edições limitadas e verificadas.`,
      collectionId: collections[index % collections.length].id,
      networkId: networks[index % networks.length].id,
      creatorUsername: creators[index % creators.length],
      imageKey,
      rarity,
      attributes: figma?.attributes ?? [
        accessoryByImage[imageKey],
        tones[index % tones.length],
        rarity === 'rare' ? 'Raro' : 'Comum',
      ],
      popularity: 20 + Math.floor(random() * 80),
      contractAddress: hexAddress(random),
      royaltyPercent: 5 + (index % 6),
      priceEth: minEth(editions.map((edition) => edition.priceEth)),
      compareAtPriceEth: figma?.compareAt ?? null,
      editions,
      listedAt: new Date(REFERENCE_TIME - index * DAY_MS).toISOString(),
      version: 1,
    })
  }
  return nfts
}

const reviewAuthors = ['colecionador.rj', 'pixel.paula', 'nft.tiago', 'galeria.sul', 'joana.arte', 'rafa.3d']
const reviewComments = [
  'Arte impecável, as cores ficam ainda melhores em tela cheia.',
  'Entrega da edição foi imediata e o certificado veio certinho.',
  'Uma das peças mais bonitas da coleção, vale cada ETH.',
  'Gostei do traço, mas esperava mais detalhes no fundo.',
  'Comprei a edição aberta e já estou de olho na 1/10.',
  'Criador muito atencioso, recomendo acompanhar os próximos drops.',
]

/**
 * Read-only reviews. Emerald Ape #042 has the 19 reviews (average 4.8) shown in the
 * Figma; some NFTs have none, to exercise the empty state.
 */
function buildReviews(nfts: Nft[]): Review[] {
  const random = createRandom(20_261_016)
  const reviews: Review[] = []
  nfts.forEach((nft, index) => {
    const count = index === 0 ? 19 : index % 5 === 4 ? 0 : 1 + Math.floor(random() * 6)
    for (let position = 0; position < count; position++) {
      const rating = index === 0 ? (position < 15 ? 5 : 4) : 3 + Math.floor(random() * 3)
      reviews.push({
        id: `rev_${nft.id}-${position + 1}`,
        nftId: nft.id,
        authorUsername: reviewAuthors[(index + position) % reviewAuthors.length],
        rating,
        comment: reviewComments[(index * 3 + position) % reviewComments.length],
        createdAt: new Date(REFERENCE_TIME - (position + 1) * 3 * DAY_MS - index * 3_600_000).toISOString(),
      })
    }
  })
  return reviews
}

/**
 * "Colecionadores também viram": for each NFT, NFTs of other collections seen by the
 * same collectors. Every twelfth NFT has none, to exercise the empty state.
 */
function buildRecommendations(nfts: Nft[]): Record<string, string[]> {
  const recommendations: Record<string, string[]> = {}
  nfts.forEach((nft, index) => {
    if (index % 12 === 11) {
      recommendations[nft.id] = []
      return
    }
    const picks: string[] = []
    for (let step = 1; picks.length < 6 && step < nfts.length; step++) {
      const candidate = nfts[(index + step * 5) % nfts.length]
      if (candidate.collectionId !== nft.collectionId && !picks.includes(candidate.id)) picks.push(candidate.id)
    }
    recommendations[nft.id] = picks
  })
  return recommendations
}

function buildFavorites(): Record<string, FavoriteRecord[]> {
  return {
    usr_ana: [
      { nftId: 'neon-vessel-552', addedAt: new Date(REFERENCE_TIME - 2 * DAY_MS).toISOString() },
      { nftId: 'golden-beat-207', addedAt: new Date(REFERENCE_TIME - 5 * DAY_MS).toISOString() },
    ],
    usr_bruno: [{ nftId: 'ivory-baron-088', addedAt: new Date(REFERENCE_TIME - 3 * DAY_MS).toISOString() }],
  }
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
  const nfts = buildNfts()
  return {
    schemaVersion: DB_SCHEMA_VERSION,
    seedVersion: SEED_VERSION,
    users: buildUsers(),
    sessions: [],
    walletsByUser: buildWallets(),
    networks,
    collections,
    nfts,
    highlights: { slideIds: ['emerald-ape-042', 'neon-vessel-552', 'golden-beat-207'], spotlightId: 'sage-nomad-009' },
    reviews: buildReviews(nfts),
    recommendations: buildRecommendations(nfts),
    favoritesByUser: buildFavorites(),
    cartsByUser: {},
    guestCarts: {},
    mergedGuestCarts: {},
    coupons: [
      { code: 'KURIO10', percentOff: 10, expiresAt: '2030-12-31T23:59:59.000Z' },
      { code: 'EXPIRED', percentOff: 20, expiresAt: '2020-01-01T00:00:00.000Z' },
    ],
    issuedQuotes: {},
    orders: [],
  }
}

export async function createSeedState(): Promise<DbState> {
  const credentials: CredentialRecord[] = await Promise.all(
    SEED_ACCOUNTS.map(async (account) => ({ userId: account.id, ...(await hashPassword(account.password)) })),
  )
  return { ...buildSeedData(), credentials }
}
