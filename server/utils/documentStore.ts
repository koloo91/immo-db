import { randomUUID, createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { eq, and } from 'drizzle-orm'
import { getDatabase, schema } from '../database'
import { analyzeDocumentWithGemini } from './gemini'
import { enqueueDocument } from './queue'

export interface StoreDocumentInput {
  propertyId: string
  fileName: string
  data: Buffer
  docType?: string
  mimeType?: string
  communicationId?: string | null
}

export interface StoredDocument {
  id: string
  fileName: string
  docType: string
  fileSize: number
  analysisStatus: string
  duplicate: boolean
  duplicateOfFileName?: string
}

/** Rät den Dokumenttyp aus dem Dateinamen, damit Mailanhänge nicht alle als "sonstiges" landen. */
export function guessDocType(fileName: string): string {
  const name = fileName.toLowerCase()
  if (/expos|inserat|angebot/.test(name)) return 'expose'
  if (/grundbuch|gba/.test(name)) return 'grundbuch'
  if (/b-?plan|bebauungsplan|bplan|festsetzung/.test(name)) return 'bplan'
  if (/kataster|flurkarte|liegenschaftskarte|alkis|flurst/.test(name)) return 'kataster'
  if (/altlast|boden(gutachten|untersuchung)|kampfmittel|baugrund/.test(name)) return 'altlasten'
  return 'sonstiges'
}

/**
 * Legt eine Datei ab und erzeugt den Datenbankeintrag. Die KI-Analyse wird NICHT
 * abgewartet - der Aufrufer bekommt sofort eine Antwort, die Analyse schreibt ihr
 * Ergebnis danach selbst in die Zeile (analysisStatus: pending -> running -> done/error).
 */
export async function storeDocument(input: StoreDocumentInput): Promise<StoredDocument> {
  const db = getDatabase()
  const { propertyId, fileName, data } = input

  const mimeType = input.mimeType || 'application/octet-stream'
  const docType = input.docType || guessDocType(fileName)
  const fileHash = createHash('sha256').update(data).digest('hex')

  // Dasselbe PDF nicht zweimal ablegen - kommt bei Makler-Mails regelmäßig vor.
  const existing = await db.query.documents.findFirst({
    where: and(
      eq(schema.documents.propertyId, propertyId),
      eq(schema.documents.fileHash, fileHash)
    )
  })

  if (existing) {
    // Kam die Datei diesmal über eine Mail, halten wir die Herkunft nachträglich fest.
    if (input.communicationId && !existing.communicationId) {
      await db.update(schema.documents)
        .set({ communicationId: input.communicationId })
        .where(eq(schema.documents.id, existing.id))
    }
    return {
      id: existing.id,
      fileName: existing.fileName,
      docType: existing.docType,
      fileSize: existing.fileSize,
      analysisStatus: existing.analysisStatus,
      duplicate: true,
      duplicateOfFileName: existing.fileName
    }
  }

  const targetDir = join(process.cwd(), 'storage', 'uploads', propertyId)
  mkdirSync(targetDir, { recursive: true })

  const docId = 'doc-' + randomUUID().slice(0, 8)
  const safeFileName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  writeFileSync(join(targetDir, safeFileName), data)
  const relativePath = join('storage', 'uploads', propertyId, safeFileName)

  // Nur PDFs kann Gemini hier auswerten; alles andere wird abgelegt, aber nicht analysiert.
  const analysable = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')

  await db.insert(schema.documents).values({
    id: docId,
    propertyId,
    fileName,
    filePath: relativePath,
    fileSize: data.length,
    docType,
    mimeType,
    fileHash,
    communicationId: input.communicationId || null,
    analysisStatus: analysable ? 'pending' : 'skipped',
    createdAt: Date.now()
  })

  if (analysable) {
    // Textextraktion, KI-Analyse und Indexierung laufen als Job. Früher stand hier ein
    // Fire-and-Forget-Aufruf - stirbt der Prozess dazwischen (bei nuxt dev durch HMR
    // regelmäßig), blieb das Dokument dauerhaft auf 'running' hängen.
    const queued = await enqueueDocument(docId)
    if (!queued) {
      // Redis nicht erreichbar: sichtbar machen statt still liegenlassen.
      await db.update(schema.documents)
        .set({ analysisError: 'Job-Queue (Redis) nicht erreichbar - wird beim nächsten Serverstart nachgeholt.' })
        .where(eq(schema.documents.id, docId))
    }
  }

  return {
    id: docId,
    fileName,
    docType,
    fileSize: data.length,
    analysisStatus: analysable ? 'pending' : 'skipped',
    duplicate: false
  }
}

/**
 * Führt die Gemini-Analyse für ein bereits abgelegtes Dokument synchron aus.
 *
 * Wird nur noch für den manuellen "Erneut versuchen"-Knopf verwendet, bei dem der Nutzer
 * auf das Ergebnis wartet. Der reguläre Weg läuft über die Queue (server/jobs/processDocument.ts),
 * damit ein Prozessabsturz den Job nicht verliert. Wirft nie - Fehler landen in analysisError.
 */
export async function runDocumentAnalysis(docId: string, buffer: Buffer, fileName: string, docType: string) {
  const db = getDatabase()

  try {
    await db.update(schema.documents)
      .set({ analysisStatus: 'running', analysisError: null })
      .where(eq(schema.documents.id, docId))

    const analysis = await analyzeDocumentWithGemini(buffer, fileName, docType)

    await db.update(schema.documents).set({
      aiSummary: analysis.summary || '',
      aiExtractedDataJson: JSON.stringify(analysis.extracted || {}),
      aiRiskAssessmentJson: JSON.stringify(analysis.riskAssessment || {}),
      analysisStatus: 'done',
      analysisError: null,
      analyzedAt: Date.now()
    }).where(eq(schema.documents.id, docId))

    return { ok: true as const, analysis }
  } catch (err: any) {
    console.error(`Analyse für ${docId} fehlgeschlagen:`, err)
    await db.update(schema.documents).set({
      analysisStatus: 'error',
      analysisError: err.message || String(err)
    }).where(eq(schema.documents.id, docId))

    return { ok: false as const, error: err.message || String(err) }
  }
}
