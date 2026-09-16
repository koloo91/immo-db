import { randomUUID } from 'node:crypto'
import { eq, and } from 'drizzle-orm'
import { getDatabase, schema } from '../database'

/**
 * Normalisiert einen Betreff für das Thread-Matching: Antwort-/Weiterleitungs-Präfixe
 * (auch mehrfach verschachtelt, auch deutsch) fliegen raus, Rest wird kleingeschrieben.
 */
export function normalizeSubject(subject: string): string {
  let result = (subject || '').trim()
  let changed = true

  while (changed) {
    changed = false
    // Re:, RE:, AW:, Aw:, Antw:, Fwd:, FW:, WG:, Wtr: - optional mit Zähler wie "Re[2]:"
    const stripped = result.replace(/^\s*(re|aw|antw|antwort|fwd?|wg|wtr|weiterleitung)\s*(\[\d+\])?\s*:\s*/i, '')
    if (stripped !== result) {
      result = stripped
      changed = true
    }
  }

  return result.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Findet den passenden Thread zum Betreff oder legt einen neuen an.
 * Gibt die Thread-ID zurück.
 */
export async function upsertThread(options: {
  propertyId: string
  subject: string
  participants: Array<string | null | undefined>
  messageAt: number
}): Promise<string> {
  const db = getDatabase()
  const subject = (options.subject || '').trim() || 'E-Mail ohne Betreff'
  const subjectKey = normalizeSubject(subject) || subject.toLowerCase()
  const now = Date.now()

  const existing = await db.query.emailThreads.findFirst({
    where: and(
      eq(schema.emailThreads.propertyId, options.propertyId),
      eq(schema.emailThreads.subjectKey, subjectKey)
    )
  })

  const incoming = options.participants
    .filter((address): address is string => !!address && address.includes('@'))
    .map(address => address.toLowerCase())

  if (existing) {
    let participants: string[] = []
    try {
      participants = existing.participantsJson ? JSON.parse(existing.participantsJson) : []
    } catch {}
    const merged = Array.from(new Set([...participants, ...incoming]))

    await db.update(schema.emailThreads).set({
      participantsJson: JSON.stringify(merged),
      lastMessageAt: Math.max(existing.lastMessageAt, options.messageAt)
    }).where(eq(schema.emailThreads.id, existing.id))

    return existing.id
  }

  const threadId = 'thr-' + randomUUID().slice(0, 8)
  await db.insert(schema.emailThreads).values({
    id: threadId,
    propertyId: options.propertyId,
    subject,
    subjectKey,
    participantsJson: JSON.stringify(Array.from(new Set(incoming))),
    lastMessageAt: options.messageAt,
    createdAt: now
  })

  return threadId
}
