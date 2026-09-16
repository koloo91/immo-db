import { eq } from 'drizzle-orm'
import { getDatabase, schema } from '../../../../database'
import { storeDocument } from '../../../../utils/documentStore'

/**
 * Nimmt eine oder mehrere Dateien entgegen und antwortet sofort.
 * Die Gemini-Analyse läuft danach im Hintergrund; der Fortschritt steht in
 * documents.analysisStatus und wird von der Oberfläche abgefragt.
 */
export default defineEventHandler(async (event) => {
  const propertyId = getRouterParam(event, 'id')
  if (!propertyId) {
    throw createError({ statusCode: 400, statusMessage: 'Property ID erforderlich' })
  }

  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Keine Datei hochgeladen' })
  }

  const fileFields = formData.filter(item => item.name === 'file' && item.data?.length)
  if (fileFields.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Dateifeld "file" fehlt' })
  }

  const docTypeField = formData.find(item => item.name === 'docType')
  const docType = docTypeField?.data ? docTypeField.data.toString() : undefined

  const commField = formData.find(item => item.name === 'communicationId')
  const communicationId = commField?.data ? commField.data.toString() : null

  const results = []
  for (const field of fileFields) {
    results.push(await storeDocument({
      propertyId,
      fileName: field.filename || `dokument-${Date.now()}.pdf`,
      data: field.data!,
      docType,
      mimeType: field.type || 'application/pdf',
      communicationId
    }))
  }

  const db = getDatabase()
  await db.update(schema.properties)
    .set({ updatedAt: Date.now() })
    .where(eq(schema.properties.id, propertyId))

  return {
    documents: results,
    uploaded: results.filter(r => !r.duplicate).length,
    duplicates: results.filter(r => r.duplicate).map(r => r.fileName)
  }
})
