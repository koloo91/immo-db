import { getDatabase } from './index'
import * as schema from './schema'
import { eq } from 'drizzle-orm'

export async function seedDatabase() {
  const db = getDatabase()

  // Check if properties already exist
  const existing = await db.select().from(schema.properties).all()
  if (existing.length > 0) {
    console.log(`Database already has ${existing.length} properties, skipping seed.`)
    return
  }

  console.log('Seeding demo properties...')

  const now = Date.now()

  // Demo Property 1: Potsdam Brauhausberg
  const prop1Id = 'prop-potsdam-001'
  await db.insert(schema.properties).values({
    id: prop1Id,
    title: 'Baugrundstück am Brauhausberg mit Weitblick',
    status: 'in_review',
    address: 'Brauhausberg 1, 14473 Potsdam',
    askingPrice: 420000,
    areaSqm: 680,
    pricePerSqm: 617.65,
    adUrl: 'https://www.immobilienscout24.de/expose/123456789',
    notes: 'Ruhige Hanglage am Brauhausberg. B-Plan Nr. 12 "Brauhausberg Nord" liegt vor. GRZ 0.25, offene Bauweise bis 2 Vollgeschosse.',
    buildingLaw: 'B-Plan Nr. 12',
    grz: 0.25,
    gfz: 0.5,
    developmentStatus: 'voll erschlossen',
    purchaseCostsPercent: 10.5,
    latitude: 52.3903,
    longitude: 13.0634,
    createdAt: now - 86400000 * 5,
    updatedAt: now - 86400000 * 1
  })

  await db.insert(schema.parcels).values({
    id: 'parcel-potsdam-001',
    propertyId: prop1Id,
    flstkennz: '12050100600546______',
    gemarkungName: 'Potsdam',
    gemarkungSchluessel: '120501',
    flur: 6,
    zaehler: 546,
    nenner: null,
    officialArea: 680,
    borisBodenrichtwert: 1200,
    borisStichtag: '2026-01-01',
    borisEntwicklungszustand: 'Baureifes Land',
    borisNutzung: 'Wohnbaufläche (W)',
    priceHistoryJson: JSON.stringify([
      { year: '2018', price: 750, stichtag: '2018-12-31' },
      { year: '2019', price: 1000, stichtag: '2019-12-31' },
      { year: '2020', price: 1000, stichtag: '2020-12-31' },
      { year: '2022', price: 1000, stichtag: '2022-01-01' },
      { year: '2024', price: 1000, stichtag: '2024-01-01' },
      { year: '2026', price: 1200, stichtag: '2026-01-01' }
    ]),
    geojsonGeometry: JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [13.0629, 52.39029],
          [13.0639, 52.39039],
          [13.0637, 52.3907],
          [13.0628, 52.3906],
          [13.0629, 52.39029]
        ]
      ]
    }),
    lastFetchedAt: now - 86400000 * 2
  })

  await db.insert(schema.brokers).values({
    id: 'broker-potsdam-001',
    propertyId: prop1Id,
    name: 'Sabine Lindner',
    company: 'Havel & Partner Immobilien Potsdam',
    email: 'lindner@havel-partner-immo.de',
    phone: '+49 331 8765432',
    website: 'https://www.havel-partner-immo.de'
  })

  await db.insert(schema.communications).values([
    {
      id: 'comm-1',
      propertyId: prop1Id,
      channel: 'email',
      direction: 'outbound',
      summary: 'Erstanfrage über ImmoScout gesendet',
      details: 'Exposé und amtlichen Flurkartenauszug angefordert.',
      nextFollowUpDate: null,
      createdAt: now - 86400000 * 5
    },
    {
      id: 'comm-2',
      propertyId: prop1Id,
      channel: 'phone',
      direction: 'inbound',
      summary: 'Telefonat mit Fr. Lindner (Maklerin)',
      details: 'Sehr nettes Gespräch. B-Plan ist rechtskräftig. Vorbesitzer hat bereits Bodengutachten anfertigen lassen (keine Auffälligkeiten). Besichtigung für nächsten Samstag 14:00 Uhr vereinbart.',
      nextFollowUpDate: '2026-09-12',
      createdAt: now - 86400000 * 3
    }
  ])

  await db.insert(schema.checklistItems).values([
    {
      id: 'chk-1',
      propertyId: prop1Id,
      category: 'expose',
      title: 'Ausführliches Makler-Exposé',
      status: 'received',
      notes: 'PDF per Mail erhalten und analysiert.',
      updatedAt: now - 86400000 * 4
    },
    {
      id: 'chk-2',
      propertyId: prop1Id,
      category: 'kataster',
      title: 'Amtlicher Flurkartenauszug (ALKIS)',
      status: 'received',
      notes: 'Über geobasis-cli abgerufen und verifiziert.',
      updatedAt: now - 86400000 * 3
    },
    {
      id: 'chk-3',
      propertyId: prop1Id,
      category: 'bplan',
      title: 'Bebauungsplan & Textliche Festsetzungen',
      status: 'received',
      notes: 'B-Plan Nr. 12 liegt vor, 2 Vollgeschosse zulässig.',
      updatedAt: now - 86400000 * 2
    },
    {
      id: 'chk-4',
      propertyId: prop1Id,
      category: 'grundbuch',
      title: 'Aktueller Grundbuchauszug (Abteilung II & III)',
      status: 'requested',
      notes: 'Warte auf Rückmeldung der Maklerin.',
      updatedAt: now - 86400000 * 2
    },
    {
      id: 'chk-5',
      propertyId: prop1Id,
      category: 'altlasten',
      title: 'Altlastenkataster & Kampfmittelbescheinigung',
      status: 'missing',
      notes: 'Noch bei der Gemeinde anzufragen.',
      updatedAt: now - 86400000 * 1
    },
    {
      id: 'chk-6',
      propertyId: prop1Id,
      category: 'erschliessung',
      title: 'Erschließungsbeitragsbescheinigung',
      status: 'requested',
      notes: 'Maklerin prüft mit Eigentümer, ob alle Beiträge abgerechnet sind.',
      updatedAt: now - 86400000 * 1
    }
  ])

  // Demo Property 2: Werder (Havel)
  const prop2Id = 'prop-werder-002'
  await db.insert(schema.properties).values({
    id: prop2Id,
    title: 'Sonniges Seegrundstück an der Havelblüte',
    status: 'contacted',
    address: 'Glindower Chaussee 18, 14542 Werder (Havel)',
    askingPrice: 285000,
    areaSqm: 820,
    pricePerSqm: 347.56,
    adUrl: 'https://www.kleinanzeigen.de/s-anzeige/grundstueck-werder/987654321',
    notes: 'Schöne Südausrichtung. Bebauung richtet sich nach §34 BauGB (Nachbarbebauung: Einfamilienhäuser mit Satteldach). Medien liegen an der Straße an.',
    buildingLaw: '§34 BauGB (Innenbereich)',
    grz: 0.2,
    gfz: 0.4,
    developmentStatus: 'teilerschlossen',
    purchaseCostsPercent: 10.5,
    latitude: 52.368,
    longitude: 12.924,
    createdAt: now - 86400000 * 8,
    updatedAt: now - 86400000 * 2
  })

  await db.insert(schema.parcels).values({
    id: 'parcel-werder-002',
    propertyId: prop2Id,
    flstkennz: '12050200300124______',
    gemarkungName: 'Werder',
    gemarkungSchluessel: '120502',
    flur: 3,
    zaehler: 124,
    nenner: null,
    officialArea: 820,
    borisBodenrichtwert: 380,
    borisStichtag: '2026-01-01',
    borisEntwicklungszustand: 'Baureifes Land',
    borisNutzung: 'Wohnbaufläche (W)',
    priceHistoryJson: JSON.stringify([
      { year: '2018', price: 210, stichtag: '2018-12-31' },
      { year: '2020', price: 290, stichtag: '2020-12-31' },
      { year: '2022', price: 340, stichtag: '2022-01-01' },
      { year: '2024', price: 360, stichtag: '2024-01-01' },
      { year: '2026', price: 380, stichtag: '2026-01-01' }
    ]),
    geojsonGeometry: JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [12.9235, 52.3678],
          [12.9248, 52.3680],
          [12.9245, 52.3684],
          [12.9232, 52.3682],
          [12.9235, 52.3678]
        ]
      ]
    }),
    lastFetchedAt: now - 86400000 * 3
  })

  await db.insert(schema.brokers).values({
    id: 'broker-werder-002',
    propertyId: prop2Id,
    name: 'Christian Meyer',
    company: 'Märkische Immobilien & Baugrund',
    email: 'meyer@maerkische-immo.de',
    phone: '+49 3327 554433',
    website: 'https://www.maerkische-immo.de'
  })

  await db.insert(schema.checklistItems).values([
    {
      id: 'chk-w-1',
      propertyId: prop2Id,
      category: 'expose',
      title: 'Ausführliches Makler-Exposé',
      status: 'received',
      notes: 'Kurzexposé vorhanden.',
      updatedAt: now - 86400000 * 7
    },
    {
      id: 'chk-w-2',
      propertyId: prop2Id,
      category: 'bplan',
      title: 'Bebauungsplan / §34 BauGB Klärung',
      status: 'requested',
      notes: 'Bauvoranfrage bei Bauamt Potsdam-Mittelmark empfohlen.',
      updatedAt: now - 86400000 * 6
    },
    {
      id: 'chk-w-3',
      propertyId: prop2Id,
      category: 'grundbuch',
      title: 'Grundbuchauszug',
      status: 'missing',
      notes: 'Noch nicht angefordert.',
      updatedAt: now - 86400000 * 6
    }
  ])

  console.log('Seeding completed successfully!')
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase().catch(console.error)
}
