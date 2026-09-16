import { randomUUID } from 'node:crypto'
import { eq, and } from 'drizzle-orm'
import { getDatabase, schema } from '../../../../database'
import { upsertThread } from '../../../../utils/emailThreads'
import { storeDocument } from '../../../../utils/documentStore'
import { reindexProperty } from '../../../../utils/search'

/**
 * Speichert eine (zuvor geparste und vom Nutzer bestätigte) E-Mail:
 * hängt sie an den passenden Thread, legt optionale Anhänge ab und übernimmt
 * die vom Nutzer angehakten Checklisten-Updates.
 */
export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  if (!propertyId) {
    throw createError({ statusCode: 400, statusMessage: 'Property ID erforderlich' })
  }

  const body = await readBody(event)
  const db = getDatabase()

  const property = await db.query.properties.findFirst({
    where: eq(schema.properties.id, propertyId)
  })
  if (!property) {
    throw createError({ statusCode: 404, statusMessage: 'Grundstück nicht gefunden' })
  }

  const subject = (body?.subject || '').toString().trim() || 'E-Mail ohne Betreff'
  const direction = body?.direction === 'outbound' ? 'outbound' : 'inbound'
  const state = ['draft', 'sent', 'received', 'logged'].includes(body?.state)
    ? body.state
    : (direction === 'inbound' ? 'received' : 'sent')

  const now = Date.now()
  const occurredAt = typeof body?.occurredAt === 'number'
    ? body.occurredAt
    : (body?.occurredAt ? Date.parse(body.occurredAt) || now : now)

  const commId = 'comm-' + randomUUID().slice(0, 8)

  // Entwürfe bekommen keinen Thread - sie sind noch nicht Teil des Verlaufs.
  const threadId = state === 'draft'
    ? null
    : await upsertThread({
        propertyId,
        subject,
        participants: [body?.fromAddress, body?.toAddress],
        messageAt: occurredAt
      })

  const summary = (body?.summary || '').toString().trim()
    || subject
    || 'E-Mail ohne Zusammenfassung'

  await db.insert(schema.communications).values({
    id: commId,
    propertyId,
    channel: 'email',
    direction,
    summary,
    details: null,
    nextFollowUpDate: body?.nextFollowUpDate || null,
    createdAt: now,
    threadId,
    subject,
    fromAddress: body?.fromAddress || null,
    toAddress: body?.toAddress || null,
    occurredAt,
    bodyText: body?.bodyText || null,
    state,
    aiInsightsJson: body?.insights ? JSON.stringify(body.insights) : null
  })

  // Anhänge aus der .eml (Base64 aus dem Parse-Schritt) ablegen und an die Mail hängen
  const storedAttachments = []
  for (const attachment of (Array.isArray(body?.attachments) ? body.attachments : [])) {
    if (!attachment?.dataBase64 || !attachment?.fileName) continue
    try {
      storedAttachments.push(await storeDocument({
        propertyId,
        fileName: attachment.fileName,
        data: Buffer.from(attachment.dataBase64, 'base64'),
        mimeType: attachment.mimeType,
        docType: attachment.docType,
        communicationId: commId
      }))
    } catch (err: any) {
      console.error(`Anhang ${attachment.fileName} konnte nicht abgelegt werden:`, err)
    }
  }

  // Bereits vorhandene Dokumente nachträglich dieser Mail zuordnen
  for (const docId of (Array.isArray(body?.attachDocumentIds) ? body.attachDocumentIds : [])) {
    await db.update(schema.documents)
      .set({ communicationId: commId })
      .where(and(
        eq(schema.documents.id, docId),
        eq(schema.documents.propertyId, propertyId)
      ))
  }

  // Vom Nutzer bestätigte Checklisten-Updates übernehmen
  const appliedChecklist: string[] = []
  for (const update of (Array.isArray(body?.checklistUpdates) ? body.checklistUpdates : [])) {
    if (!update?.title || !update?.status) continue
    const item = await db.query.checklistItems.findFirst({
      where: and(
        eq(schema.checklistItems.propertyId, propertyId),
        eq(schema.checklistItems.title, update.title)
      )
    })
    if (!item) continue

    await db.update(schema.checklistItems)
      .set({ status: update.status, updatedAt: now })
      .where(eq(schema.checklistItems.id, item.id))
    appliedChecklist.push(update.title)
  }

  await db.update(schema.properties)
    .set({ updatedAt: now })
    .where(eq(schema.properties.id, propertyId))


  // Suchindex nachziehen - Fehler dürfen den Request nicht kippen,
  // der Start-Reindex holt es sonst nach.
  await reindexProperty(propertyId).catch(err => console.warn('[Suche] Index-Update:', err.message))

  return {
    id: commId,
    threadId,
    attachments: storedAttachments,
    appliedChecklist,
    success: true
  }
})
