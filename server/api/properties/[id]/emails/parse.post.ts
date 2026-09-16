import { eq } from 'drizzle-orm'
import { getDatabase, schema } from '../../../../database'
import { parseEmailWithGemini } from '../../../../utils/gemini'
import { parseEml } from '../../../../utils/emlParser'
import { guessDocType } from '../../../../utils/documentStore'

/**
 * Wertet eingefügten Mailtext oder eine hochgeladene .eml-Datei aus und gibt das
 * Ergebnis nur zurück - gespeichert wird erst nach Bestätigung durch den Nutzer
 * über POST /api/properties/:id/emails.
 */
export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  if (!propertyId) {
    throw createError({ statusCode: 400, statusMessage: 'Property ID erforderlich' })
  }

  const db = getDatabase()
  const property = await db.query.properties.findFirst({
    where: eq(schema.properties.id, propertyId),
    with: { broker: true, checklistItems: true }
  })

  if (!property) {
    throw createError({ statusCode: 404, statusMessage: 'Grundstück nicht gefunden' })
  }

  const contentType = getHeader(event, 'content-type') || ''
  let rawText = ''
  let emlAttachments: Array<{ fileName: string, mimeType: string, size: number, docType: string, dataBase64: string }> = []

  if (contentType.includes('multipart/form-data')) {
    const formData = await readMultipartFormData(event)
    const fileField = formData?.find(item => item.name === 'file' && item.data?.length)
    if (!fileField?.data) {
      throw createError({ statusCode: 400, statusMessage: 'Keine .eml-Datei im Feld "file" gefunden' })
    }

    const parsed = parseEml(fileField.data)
    rawText = [parsed.headerText, '', parsed.bodyText].join('\n').trim()

    // Anhänge reichen wir als Base64 zurück; erst beim Speichern werden sie abgelegt.
    emlAttachments = parsed.attachments.map(attachment => ({
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.data.length,
      docType: guessDocType(attachment.fileName),
      dataBase64: attachment.data.toString('base64')
    }))
  } else {
    const body = await readBody(event)
    rawText = (body?.rawText || '').toString()
  }

  if (!rawText.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Kein Mailtext übergeben' })
  }

  const config = useRuntimeConfig()
  const parsed = await parseEmailWithGemini(rawText, {
    title: property.title,
    address: property.address || undefined,
    brokerEmail: property.broker?.email || null,
    brokerName: property.broker?.name || null,
    ownEmail: (config.ownEmail as string) || process.env.OWN_EMAIL || null,
    checklistTitles: property.checklistItems.map(item => item.title)
  })

  // ISO-Datum des Modells in einen Timestamp umrechnen, aber nur wenn er plausibel ist.
  let occurredAt: number | null = null
  if (parsed.occurredAt) {
    const timestamp = Date.parse(parsed.occurredAt)
    if (!Number.isNaN(timestamp)) occurredAt = timestamp
  }

  return {
    ...parsed,
    occurredAt,
    occurredAtIso: occurredAt ? new Date(occurredAt).toISOString() : null,
    attachments: emlAttachments
  }
})
