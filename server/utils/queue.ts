import { Queue, Worker, type ConnectionOptions } from 'bullmq'
import IORedis from 'ioredis'

export const DOCUMENT_QUEUE = 'documents'
export const LISTING_QUEUE = 'listings'

export interface ProcessDocumentJob {
  documentId: string
}

export interface CheckListingsJob {
  /** true = geplanter Tageslauf (ein Abrufversuch), false = vom Nutzer ausgelöst. */
  scheduled: boolean
  propertyIds?: string[]
}

let connection: IORedis | null = null
let queue: Queue<ProcessDocumentJob> | null = null
let listingQueue: Queue<CheckListingsJob> | null = null

/**
 * BullMQ verlangt maxRetriesPerRequest: null - sonst bricht ioredis laufende
 * Blocking-Kommandos ab, sobald Redis kurz weg ist.
 */
export function getRedisConnection(): IORedis {
  if (!connection) {
    const config = useRuntimeConfig()
    connection = new IORedis(config.redisUrl as string, {
      maxRetriesPerRequest: null,
      // Ohne Redis soll die App weiterlaufen, statt beim Start zu sterben.
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 1000, 15000)
    })
    connection.on('error', (err) => {
      // Nur einmal pro Fehlerart lärmen - ioredis wiederholt sonst im Sekundentakt.
      if ((connection as any)?.__lastError !== err.message) {
        ;(connection as any).__lastError = err.message
        console.warn(`[Queue] Redis: ${err.message}`)
      }
    })
  }
  return connection
}

export function getDocumentQueue(): Queue<ProcessDocumentJob> {
  if (!queue) {
    queue = new Queue<ProcessDocumentJob>(DOCUMENT_QUEUE, {
      connection: getRedisConnection() as unknown as ConnectionOptions,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86400 }
      }
    })
  }
  return queue
}

export async function enqueueDocument(documentId: string): Promise<boolean> {
  try {
    await getDocumentQueue().add(
      'process-document',
      { documentId },
      // jobId verhindert Doppelverarbeitung, wenn dasselbe Dokument mehrfach
      // eingereiht wird (z. B. Upload + Kategoriewechsel kurz hintereinander).
      { jobId: `doc:${documentId}:${Date.now()}` }
    )
    return true
  } catch (err: any) {
    console.warn(`[Queue] Job für ${documentId} konnte nicht eingereiht werden: ${err.message}`)
    return false
  }
}

export function getListingQueue(): Queue<CheckListingsJob> {
  if (!listingQueue) {
    listingQueue = new Queue<CheckListingsJob>(LISTING_QUEUE, {
      connection: getRedisConnection() as unknown as ConnectionOptions,
      defaultJobOptions: {
        // Weniger Versuche als bei Dokumenten: verpasst der Lauf einen Tag,
        // läuft er morgen wieder - es geht nichts verloren.
        attempts: 2,
        backoff: { type: 'exponential', delay: 60000 },
        removeOnComplete: { age: 86400, count: 30 },
        removeOnFail: { age: 604800 }
      }
    })
  }
  return listingQueue
}

/** Richtet den täglichen Lauf ein. Redis behält den Zeitplan über Neustarts hinweg. */
export async function scheduleDailyListingCheck(): Promise<boolean> {
  try {
    const queue = getListingQueue()
    // Alte Definitionen entfernen, damit eine geänderte Uhrzeit auch greift.
    for (const scheme of await queue.getJobSchedulers()) {
      await queue.removeJobScheduler(scheme.key).catch(() => {})
    }
    await queue.upsertJobScheduler(
      'daily-listing-check',
      { pattern: '0 7 * * *', tz: 'Europe/Berlin' },
      { name: 'check-listings', data: { scheduled: true } }
    )
    return true
  } catch (err: any) {
    console.warn(`[Queue] Tageslauf konnte nicht eingeplant werden: ${err.message}`)
    return false
  }
}

export async function enqueueListingCheck(job: CheckListingsJob): Promise<boolean> {
  try {
    await getListingQueue().add('check-listings', job)
    return true
  } catch (err: any) {
    console.warn(`[Queue] Inseratsprüfung konnte nicht eingereiht werden: ${err.message}`)
    return false
  }
}

export function createListingWorker(
  processor: (job: { data: CheckListingsJob }) => Promise<unknown>
): Worker<CheckListingsJob> {
  return new Worker<CheckListingsJob>(LISTING_QUEUE, processor as any, {
    connection: getRedisConnection() as unknown as ConnectionOptions,
    // Nebenläufigkeit 1: die Abstände zwischen den Portalen sollen eingehalten werden.
    concurrency: 1,
    stalledInterval: 60000,
    maxStalledCount: 1
  })
}

export async function getQueueStatus(): Promise<{ online: boolean, message: string, counts?: Record<string, number>, listingCounts?: Record<string, number> }> {
  const config = useRuntimeConfig()
  try {
    const [docs, listings] = await Promise.all([
      getDocumentQueue().getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      getListingQueue().getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')
    ])
    return {
      online: true,
      message: 'Redis ist erreichbar.',
      counts: docs as Record<string, number>,
      listingCounts: listings as Record<string, number>
    }
  } catch (err: any) {
    return { online: false, message: `Redis nicht erreichbar unter ${config.redisUrl}: ${err.message}` }
  }
}

export function createDocumentWorker(
  processor: (job: { data: ProcessDocumentJob }) => Promise<unknown>
): Worker<ProcessDocumentJob> {
  return new Worker<ProcessDocumentJob>(DOCUMENT_QUEUE, processor as any, {
    connection: getRedisConnection() as unknown as ConnectionOptions,
    // Gemini-Jobs laufen im Nitro-Event-Loop - mehr als zwei parallel bringen nichts
    // und würden Requests ausbremsen.
    concurrency: 2,
    // Stirbt der Prozess mitten im Job (bei nuxt dev durch HMR regelmäßig),
    // gibt BullMQ den Job nach diesem Intervall wieder frei.
    stalledInterval: 30000,
    maxStalledCount: 2
  })
}

export async function closeQueue(): Promise<void> {
  await queue?.close().catch(() => {})
  await listingQueue?.close().catch(() => {})
  connection?.disconnect()
  queue = null
  listingQueue = null
  connection = null
}
