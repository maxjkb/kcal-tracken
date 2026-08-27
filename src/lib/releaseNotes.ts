/**
 * What changed in each released version, in the app's own words.
 *
 * Kept here rather than parsed from CHANGELOG.md at runtime: the changelog is
 * a repository file and never ships in the bundle, and fetching it would make
 * a settings screen depend on the network to describe the app you already
 * have installed. The two are maintained together at release time.
 *
 * Newest first. Deliberately short — this answers "what's new since I last
 * looked", not "what exactly was touched".
 */
export interface ReleaseNote {
  version: string
  date: string
  highlights: string[]
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.14.1',
    date: '2026-08-27',
    highlights: [
      'Der Farbwechsel im Hintergrund beim Seitenwechsel läuft jetzt weich statt hart.',
      'Der blaue Farbverlauf oben nimmt jetzt bis zur Bildschirmhälfte ein.',
      'Nährwertringe im Hintergrund: weniger verschwommen, deutlicher sichtbar.',
      'Alle bisher "provisorischen" Farben (Protein, Fehler, mehrere Mikronährstoffe) kommen jetzt ebenfalls direkt aus der erweiterten Farbpalette.',
    ],
  },
  {
    version: '1.14.0',
    date: '2026-08-27',
    highlights: [
      'Hintergrund: verschwommene Nährwertringe wie auf dem App-Icon unten rechts, kräftigerer Farbverlauf am oberen Rand, "flüssigeres" Liquid Glass mit Lichtreflex und leichter Eigenbewegung.',
      'Farben an die hochgeladene Palette angeglichen: Feed exakt #1E90FF, Rezepte/Supplements heller, Statistik dunkler.',
      'Statistik: Mikronährstoff-Kacheln jetzt nach Wichtigkeit sortiert (wichtigster Nährstoff oben).',
    ],
  },
  {
    version: '1.13.0',
    date: '2026-08-26',
    highlights: [
      'Mikronährstoff-Balken neu gestaltet: Abkürzung (z. B. „Fe") in Akzentfarbe über dem Balken, Name darunter, keine Prozentzahlen mehr — stattdessen ein Zeiger auf einem hell-zu-dunkel-Verlauf in drei Dritteln.',
      'Statistik: Makronährstoffe stehen wieder oben, Mikronährstoffe darunter.',
      'Mikronährstoffe werden jetzt auch rückwirkend für bereits eingetragene Mahlzeiten grob nachgeschätzt.',
    ],
  },
  {
    version: '1.12.0',
    date: '2026-08-26',
    highlights: [
      'Mikronährstoffe: 10 wichtige Vitamine/Mineralstoffe werden jetzt mitgeschätzt — als gut/durchschnittlich/unterrepräsentiert statt exakter Werte, gemittelt über die letzte Woche.',
      'Mahlzeit-Detail zeigt jetzt "Gute Quelle für"-Badges für Mikronährstoffe.',
      'Statistik: neue Mikronährstoff-Übersicht (kleine Balken), Makronährstoffe rutschen dafür eine Stufe tiefer.',
      'Supplement-Empfehlungen berücksichtigen jetzt auch unterrepräsentierte Mikronährstoffe, nicht nur Makros.',
    ],
  },
  {
    version: '1.11.0',
    date: '2026-08-26',
    highlights: [
      'Neu im Feed: Glühbirne oben rechts mit "Was jetzt essen"-Tipps — konkrete Zutaten statt Rezepte, passend zu offenen Tageszielen und Tageszeit, aktualisiert sich automatisch zu Frühstück/Mittag/Snack/Abend.',
    ],
  },
  {
    version: '1.10.0',
    date: '2026-08-26',
    highlights: [
      'Mahlzeit-Vorschläge im Editor: Stift-Symbol übernimmt die Beschreibung statt der alten Zahlen, damit "das Übliche, aber heute mit Banane" neu geschätzt werden kann.',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-08-25',
    highlights: [
      'Neu in den Einstellungen: Version & Neuigkeiten, Aktualisierung und Kontingent.',
      'Gemini wechselt automatisch das Modell, wenn ein Tageskontingent aufgebraucht ist.',
      'Größere Schaltflächen überall, Farben pro Mahlzeit-Typ, Apfel statt Stern beim Snack.',
      'Statistik: Punkt-Diagramm mit Trendlinie, Nährwert-Detail beim Antippen eines Punktes.',
      'Mahlzeit-Editor: Vorschläge mit Nährwert-Ringen, Galerie-Button, breiteres Textfeld.',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-08-25',
    highlights: [
      'Sheets lassen sich von überall wegwischen und öffnen nur noch halbhoch.',
      'Fixierte Titelzeile auf den Hauptseiten, Inhalt läuft darunter durch.',
      '22 Fehler behoben, darunter mehrere stille Datenverluste.',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-08-25',
    highlights: [
      'Wischen zwischen den Hauptseiten, synchron mit der Bedienleiste.',
      'Nicht gespeicherte Eingaben überleben ein versehentliches Schließen.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-08-25',
    highlights: [
      'Supplement-Katalog auf 89 Einträge erweitert, mit Suche.',
      'Empfehlungen aktualisieren sich einmal täglich und bleiben konsistent.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-08-25',
    highlights: [
      'Neue Reihenfolge der Bedienleiste, Einstellungen und "+" oben rechts.',
      'Feed hat eine eigene Überschrift.',
    ],
  },
]

export const CURRENT_VERSION = __APP_VERSION__

/** The notes for the running build, if this version has any. */
export function currentReleaseNote(): ReleaseNote | undefined {
  return RELEASE_NOTES.find((n) => n.version === CURRENT_VERSION)
}
