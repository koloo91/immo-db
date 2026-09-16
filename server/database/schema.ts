import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

export const properties = sqliteTable('properties', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull().default('new'), // 'new' | 'contacted' | 'docs_requested' | 'in_review' | 'visiting' | 'offer_made' | 'rejected' | 'purchased'
  address: text('address'),
  askingPrice: real('asking_price'),
  areaSqm: real('area_sqm'),
  pricePerSqm: real('price_per_sqm'),
  adUrl: text('ad_url'),
  notes: text('notes'),
  buildingLaw: text('building_law'), // 'B-Plan', '§34 BauGB', '§35 Außenbereich', etc.
  grz: real('grz'), // Grundflächenzahl
  gfz: real('gfz'), // Geschossflächenzahl
  developmentStatus: text('development_status'), // 'erschlossen', 'teilerschlossen', 'unerschlossen'
  purchaseCostsPercent: real('purchase_costs_percent').default(10.5), // Makler + Notar + Grunderwerbsteuer BB
  latitude: real('latitude'),
  longitude: real('longitude'),
  primaryImageUrl: text('primary_image_url'),
  imagesJson: text('images_json'), // Array of image URLs
  ancillaryCostsJson: text('ancillary_costs_json'), // Custom Nebenkosten breakdown
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const parcels = sqliteTable('parcels', {
  id: text('id').primaryKey(),
  propertyId: text('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  flstkennz: text('flstkennz'), // 20-stelliges LGB Kennzeichen z.B. 12050100600546______
  gemarkungName: text('gemarkung_name'),
  gemarkungSchluessel: text('gemarkung_schluessel'),
  flur: integer('flur'),
  zaehler: integer('zaehler'),
  nenner: integer('nenner'),
  officialArea: real('official_area'),
  borisBodenrichtwert: real('boris_bodenrichtwert'),
  borisStichtag: text('boris_stichtag'),
  borisEntwicklungszustand: text('boris_entwicklungszustand'),
  borisNutzung: text('boris_nutzung'),
  priceHistoryJson: text('price_history_json'), // Array of { year, price, stichtag }
  geojsonGeometry: text('geojson_geometry'), // GeoJSON Polygon from ALKIS
  lastFetchedAt: integer('last_fetched_at')
})

export const brokers = sqliteTable('brokers', {
  id: text('id').primaryKey(),
  propertyId: text('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  name: text('name'),
  company: text('company'),
  email: text('email'),
  phone: text('phone'),
  website: text('website')
})

// E-Mail-Threads bündeln zusammengehörige Nachrichten (Betreff-basiert, "AW:"/"Re:" normalisiert)
export const emailThreads = sqliteTable('email_threads', {
  id: text('id').primaryKey(),
  propertyId: text('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  subject: text('subject').notNull(),
  subjectKey: text('subject_key').notNull(), // normalisierter Betreff für das Thread-Matching
  participantsJson: text('participants_json'), // Array von E-Mail-Adressen
  lastMessageAt: integer('last_message_at').notNull(),
  createdAt: integer('created_at').notNull()
})

export const communications = sqliteTable('communications', {
  id: text('id').primaryKey(),
  propertyId: text('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull(), // 'phone' | 'email' | 'meeting' | 'note'
  direction: text('direction').notNull().default('outbound'), // 'inbound' | 'outbound'
  summary: text('summary').notNull(),
  details: text('details'),
  nextFollowUpDate: text('next_follow_up_date'),
  createdAt: integer('created_at').notNull(),
  // E-Mail-spezifische Felder (nullable, Telefonate/Notizen lassen sie leer)
  threadId: text('thread_id').references(() => emailThreads.id, { onDelete: 'cascade' }),
  subject: text('subject'),
  fromAddress: text('from_address'),
  toAddress: text('to_address'),
  occurredAt: integer('occurred_at'), // tatsächlicher Zeitpunkt der Mail, nicht der Erfassung
  bodyText: text('body_text'), // Originaltext der Mail
  state: text('state').notNull().default('logged'), // 'logged' | 'draft' | 'sent' | 'received'
  aiInsightsJson: text('ai_insights_json') // { commitments, facts, checklistUpdates, openQuestions }
})

export const checklistItems = sqliteTable('checklist_items', {
  id: text('id').primaryKey(),
  propertyId: text('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  category: text('category').notNull(), // 'grundbuch' | 'bplan' | 'kataster' | 'altlasten' | 'erschliessung' | 'gebaeude_bestand' | 'sonstiges'
  title: text('title').notNull(),
  status: text('status').notNull().default('missing'), // 'missing' | 'requested' | 'received' | 'not_applicable'
  notes: text('notes'),
  updatedAt: integer('updated_at').notNull()
})

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  propertyId: text('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size').notNull(),
  docType: text('doc_type').notNull().default('sonstiges'), // 'expose' | 'bplan' | 'kataster' | 'grundbuch' | 'altlasten' | 'sonstiges'
  aiSummary: text('ai_summary'),
  aiExtractedDataJson: text('ai_extracted_data_json'),
  aiRiskAssessmentJson: text('ai_risk_assessment_json'),
  createdAt: integer('created_at').notNull(),
  // Herkunft & Analyse-Status
  communicationId: text('communication_id').references(() => communications.id, { onDelete: 'set null' }),
  fileHash: text('file_hash'), // sha256 zur Duplikaterkennung
  mimeType: text('mime_type'),
  analysisStatus: text('analysis_status').notNull().default('pending'), // 'pending' | 'running' | 'done' | 'error' | 'skipped'
  analysisError: text('analysis_error'),
  analyzedAt: integer('analyzed_at'),
  // Volltextextraktion für die Suche
  pageCount: integer('page_count'),
  hasTextLayer: integer('has_text_layer'), // 0 = Bild-PDF ohne Textebene (Scan)
  textStatus: text('text_status').notNull().default('pending'), // 'pending' | 'done' | 'none' | 'error' | 'skipped'
  textExtractedAt: integer('text_extracted_at')
})

// Seitenweiser Volltext eines Dokuments - Träger der seitengenauen Suchtreffer.
export const documentPages = sqliteTable('document_pages', {
  id: text('id').primaryKey(),
  documentId: text('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  propertyId: text('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  pageNumber: integer('page_number').notNull(),
  text: text('text').notNull(),
  createdAt: integer('created_at').notNull()
})

// Versionierte KI-Gesamtbewertung eines Grundstücks über alle Dokumente + Mailverlauf
export const propertyAnalyses = sqliteTable('property_analyses', {
  id: text('id').primaryKey(),
  propertyId: text('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
  model: text('model'),
  isSimulated: integer('is_simulated').notNull().default(0),
  scoreOverall: integer('score_overall'), // 0-100
  verdict: text('verdict'), // kurzes Fazit, z. B. 'Aussichtsreich mit Klärungsbedarf'
  summary: text('summary'),
  risksJson: text('risks_json'), // Array von { title, severity, source }
  opportunitiesJson: text('opportunities_json'),
  openQuestionsJson: text('open_questions_json'),
  priceAssessmentJson: text('price_assessment_json'), // { verdict, fairPricePerSqm, deviationPercent, reasoning }
  inputSnapshotJson: text('input_snapshot_json') // { askingPrice, areaSqm, documentIds, emailCount, ... }
})

// Preisverlauf eines Inserats. Bewusst nur bei Veränderung ein Eintrag -
// 365 identische Zeilen pro Jahr wären Rauschen, keine Information.
export const priceObservations = sqliteTable('price_observations', {
  id: text('id').primaryKey(),
  propertyId: text('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  observedAt: integer('observed_at').notNull(),
  kind: text('kind').notNull(), // 'first_seen' | 'price_change' | 'listing_gone' | 'listing_back'
  price: real('price'),
  previousPrice: real('previous_price'),
  pricePerSqm: real('price_per_sqm'),
  source: text('source').notNull().default('auto'), // 'auto' | 'manual' | 'email'
  note: text('note')
})

// Laufender Zustand der Inseratsprüfung, 1:1 zum Grundstück.
// Getrennt von `properties`, damit die Stammdatentabelle nicht um ein Dutzend
// Betriebsspalten wächst.
export const listingStatus = sqliteTable('listing_status', {
  propertyId: text('property_id')
    .primaryKey()
    .references(() => properties.id, { onDelete: 'cascade' }),
  portal: text('portal'), // 'immowelt' | 'kleinanzeigen' | 'immoscout24' | 'sonstiges'
  // 'unverifiable' ist ausdrücklich KEINE Aussage über das Inserat, sondern über den Abruf.
  state: text('state').notNull().default('unknown'), // 'unknown' | 'online' | 'suspect' | 'offline' | 'unverifiable'
  lastCheckedAt: integer('last_checked_at'),
  lastOkAt: integer('last_ok_at'),
  lastMessage: text('last_message'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  suspectSince: integer('suspect_since'),
  // Gedächtnis des letzten erfolgreichen Abrufs - Grundlage des Strukturbruch-Vergleichs.
  lastSeenTitle: text('last_seen_title'),
  lastSeenPrice: real('last_seen_price'),
  firstSeenAt: integer('first_seen_at'),
  // Gefundener Preis, der noch bestätigt werden muss (wird nie automatisch übernommen).
  pendingPrice: real('pending_price'),
  pendingPriceSeenAt: integer('pending_price_seen_at'),
  alertAckAt: integer('alert_ack_at')
})

export const documentChats = sqliteTable('document_chats', {
  id: text('id').primaryKey(),
  propertyId: text('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant'
  message: text('message').notNull(),
  createdAt: integer('created_at').notNull()
})

// Drizzle Relations
export const propertiesRelations = relations(properties, ({ one, many }) => ({
  parcel: one(parcels, {
    fields: [properties.id],
    references: [parcels.propertyId]
  }),
  broker: one(brokers, {
    fields: [properties.id],
    references: [brokers.propertyId]
  }),
  communications: many(communications),
  emailThreads: many(emailThreads),
  checklistItems: many(checklistItems),
  documents: many(documents),
  documentChats: many(documentChats),
  analyses: many(propertyAnalyses),
  priceObservations: many(priceObservations),
  listingStatus: one(listingStatus, {
    fields: [properties.id],
    references: [listingStatus.propertyId]
  })
}))

export const parcelsRelations = relations(parcels, ({ one }) => ({
  property: one(properties, {
    fields: [parcels.propertyId],
    references: [properties.id]
  })
}))

export const brokersRelations = relations(brokers, ({ one }) => ({
  property: one(properties, {
    fields: [brokers.propertyId],
    references: [properties.id]
  })
}))

export const emailThreadsRelations = relations(emailThreads, ({ one, many }) => ({
  property: one(properties, {
    fields: [emailThreads.propertyId],
    references: [properties.id]
  }),
  messages: many(communications)
}))

export const communicationsRelations = relations(communications, ({ one, many }) => ({
  property: one(properties, {
    fields: [communications.propertyId],
    references: [properties.id]
  }),
  thread: one(emailThreads, {
    fields: [communications.threadId],
    references: [emailThreads.id]
  }),
  attachments: many(documents)
}))

export const checklistItemsRelations = relations(checklistItems, ({ one }) => ({
  property: one(properties, {
    fields: [checklistItems.propertyId],
    references: [properties.id]
  })
}))

export const documentsRelations = relations(documents, ({ one, many }) => ({
  property: one(properties, {
    fields: [documents.propertyId],
    references: [properties.id]
  }),
  communication: one(communications, {
    fields: [documents.communicationId],
    references: [communications.id]
  }),
  pages: many(documentPages)
}))

export const documentPagesRelations = relations(documentPages, ({ one }) => ({
  document: one(documents, {
    fields: [documentPages.documentId],
    references: [documents.id]
  }),
  property: one(properties, {
    fields: [documentPages.propertyId],
    references: [properties.id]
  })
}))

export const propertyAnalysesRelations = relations(propertyAnalyses, ({ one }) => ({
  property: one(properties, {
    fields: [propertyAnalyses.propertyId],
    references: [properties.id]
  })
}))

export const documentChatsRelations = relations(documentChats, ({ one }) => ({
  property: one(properties, {
    fields: [documentChats.propertyId],
    references: [properties.id]
  })
}))

export const priceObservationsRelations = relations(priceObservations, ({ one }) => ({
  property: one(properties, {
    fields: [priceObservations.propertyId],
    references: [properties.id]
  })
}))

export const listingStatusRelations = relations(listingStatus, ({ one }) => ({
  property: one(properties, {
    fields: [listingStatus.propertyId],
    references: [properties.id]
  })
}))
