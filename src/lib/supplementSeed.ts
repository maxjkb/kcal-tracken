import { db, newSupplementId, type Supplement, type SupplementCategory } from './db'

/**
 * The built-in supplement catalog — a solid, mainstream starting set
 * covering the three categories, not an exhaustive database. The user can
 * freely add their own entries alongside these (see RecipeEditor's "Zutat
 * +" for the same "seed list + user additions in one table" pattern).
 * Dosages are general population ranges, not personalized advice — see the
 * disclaimer on the Supplements page.
 */
const SEED: Array<Omit<Supplement, 'id' | 'isCustom' | 'createdAt'>> = [
  {
    name: 'Proteinpulver',
    category: 'build_muscle',
    description: 'Deckt den Proteinbedarf, wenn er über die Ernährung allein schwer zu erreichen ist.',
    typicalDosage: '20–40 g, z.B. nach dem Training oder als Mahlzeitenergänzung',
  },
  {
    name: 'Kreatin (Monohydrat)',
    category: 'build_muscle',
    description: 'Eines der am besten belegten Supplements für Kraft- und Muskelaufbau — wirkt unabhängig vom Trainingstag.',
    typicalDosage: '3–5 g täglich, auch an trainingsfreien Tagen',
  },
  {
    name: 'Beta-Alanin',
    category: 'build_muscle',
    description: 'Kann die Ausdauer bei kurzen, intensiven Belastungen verbessern.',
    typicalDosage: '3–5 g täglich, aufgeteilt auf mehrere Portionen',
  },
  {
    name: 'Magnesium',
    category: 'recovery',
    description: 'Unterstützt Muskelfunktion, Erholung und Schlaf — bei erhöhtem Training steigt der Bedarf.',
    typicalDosage: '300–400 mg, oft abends',
  },
  {
    name: 'Ashwagandha',
    category: 'recovery',
    description: 'Adaptogen, das mit Stressreduktion und besserer Erholung in Verbindung gebracht wird.',
    typicalDosage: '300–600 mg Extrakt täglich',
  },
  {
    name: 'Kollagen',
    category: 'recovery',
    description: 'Wird mit Gelenk- und Sehnengesundheit in Verbindung gebracht, besonders bei intensivem Training.',
    typicalDosage: '10–15 g täglich',
  },
  {
    name: 'Omega-3',
    category: 'general_health',
    description: 'Deckt EPA/DHA, wenn fetter Fisch selten auf dem Speiseplan steht.',
    typicalDosage: '1–2 g EPA/DHA täglich, zu einer Mahlzeit',
  },
  {
    name: 'Vitamin D3',
    category: 'general_health',
    description: 'Besonders in den lichtärmeren Monaten oft eine sinnvolle Ergänzung.',
    typicalDosage: '1000–2000 IE täglich',
  },
  {
    name: 'Zink',
    category: 'general_health',
    description: 'Unterstützt Immunsystem und Hormonhaushalt.',
    typicalDosage: '15–25 mg täglich',
  },
  {
    name: 'Multivitamin',
    category: 'general_health',
    description: 'Breite Grundabsicherung bei lückenhafter Mikronährstoffzufuhr.',
    typicalDosage: '1 Kapsel täglich',
  },
]

/** Populates the catalog with the built-in list once, on first-ever load — never re-runs once the table has any rows, so deleting a seeded entry sticks. */
export async function seedSupplementsIfEmpty(): Promise<void> {
  const count = await db.supplements.count()
  if (count > 0) return
  const now = Date.now()
  await db.supplements.bulkAdd(
    SEED.map((s) => ({
      ...s,
      id: newSupplementId(),
      isCustom: false,
      createdAt: now,
    })),
  )
}

export const SUPPLEMENT_CATEGORY_ORDER: SupplementCategory[] = ['build_muscle', 'recovery', 'general_health']
