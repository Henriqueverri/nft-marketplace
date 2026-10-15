/**
 * Unsaved form drafts, kept per user in sessionStorage so that an expired session
 * can be resumed where it stopped. The user id is part of the key: a draft is only
 * ever read back for the account that wrote it. Logout deletes the user's drafts.
 */

const PREFIX = 'kurio:draft:'

function key(userId: string, name: string): string {
  return `${PREFIX}${userId}:${name}`
}

export function readDraft(userId: string, name: string): string | null {
  return sessionStorage.getItem(key(userId, name))
}

export function writeDraft(userId: string, name: string, value: string): void {
  try {
    sessionStorage.setItem(key(userId, name), value)
  } catch {
    // Losing a draft is acceptable; the form itself keeps working.
  }
}

export function clearDraft(userId: string, name: string): void {
  sessionStorage.removeItem(key(userId, name))
}

export function clearUserDrafts(userId: string): void {
  const ownPrefix = `${PREFIX}${userId}:`
  for (const storedKey of Object.keys(sessionStorage)) {
    if (storedKey.startsWith(ownPrefix)) sessionStorage.removeItem(storedKey)
  }
}
