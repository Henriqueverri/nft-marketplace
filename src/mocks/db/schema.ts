import { z } from 'zod'
import { collectionSchema, networkSchema, nftSchema } from '@/contracts/catalog'
import { isoDateTimeSchema, userIdSchema } from '@/contracts/common'
import { walletSchema } from '@/contracts/wallets'
import { PASSWORD_KDF } from './password'

/**
 * Shape of the persisted mock database. It is validated on every load, so a
 * corrupted or tampered copy is detected instead of being used.
 * Private data (credentials, sessions, wallets) is keyed by user id.
 */

export const DB_SCHEMA_VERSION = 1

const userRecordSchema = z.object({
  id: userIdSchema,
  username: z.string(),
  email: z.email(),
  displayName: z.string(),
  ensName: z.string().nullable(),
  walletNickname: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  profileVersion: z.number().int().positive(),
})
export type UserRecord = z.infer<typeof userRecordSchema>

const credentialRecordSchema = z.object({
  userId: userIdSchema,
  algorithm: z.literal(PASSWORD_KDF.algorithm),
  iterations: z.number().int().positive(),
  salt: z.string(),
  hash: z.string(),
})
export type CredentialRecord = z.infer<typeof credentialRecordSchema>

const sessionRecordSchema = z.object({
  id: z.string(),
  userId: userIdSchema,
  /** SHA-256 hex digest of the opaque token; the token itself is never stored. */
  tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  revokedAt: isoDateTimeSchema.nullable(),
})
export type SessionRecord = z.infer<typeof sessionRecordSchema>

export const dbStateSchema = z.object({
  schemaVersion: z.literal(DB_SCHEMA_VERSION),
  seedVersion: z.number().int(),
  users: z.array(userRecordSchema),
  credentials: z.array(credentialRecordSchema),
  sessions: z.array(sessionRecordSchema),
  walletsByUser: z.record(userIdSchema, z.array(walletSchema)),
  networks: z.array(networkSchema),
  collections: z.array(collectionSchema),
  nfts: z.array(nftSchema),
})
export type DbState = z.infer<typeof dbStateSchema>
