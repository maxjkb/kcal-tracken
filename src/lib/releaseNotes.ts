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
    version: '1.18.0',
    date: '2026-08-31',
    highlights: [
      'Texteingaben docken jetzt Apple-Style direkt über der ausgefahrenen Tastatur an, statt weiter oben im Formular zu bleiben — betrifft alle Sheets (Mahlzeiten-Editor u.a.) sowie die Such-/Eingabefelder auf Seiten selbst.',
      'Angedockte Felder bekommen einen leichten 3D-Schatten; darunter scrollende Inhalte blenden per Farbverlauf aus, statt hart abgeschnitten zu werden.',
    ],
  },
  {
    version: '1.17.2',
    date: '2026-08-31',
    highlights: [
      'Unter Heute öffnet ein Tippen auf ein aktives Supplement jetzt eine Kurzbeschreibung mit einer live aktualisierten Einschätzung deines aktuellen Bedarfs — Bearbeiten (Dosierung/Zeiten) ist von dort aus weiterhin einen Tap entfernt.',
    ],
  },
  {
    version: '1.17.1',
    date: '2026-08-31',
    highlights: [
      'Supplementscore ist jetzt fortlaufend statt an den Statistik-Zeitraum gebunden — er setzt sich nicht mehr zurück, egal welche Ansicht (Tag/Woche/Monat/Jahr) gerade offen ist.',
      'Neue Supp-Score-Seite: Antippen des Scores öffnet jetzt eine eigene Seite mit Aufschlüsselung pro Supplement und einer Kalenderübersicht, statt auf die Heute-Ansicht zu springen.',
    ],
  },
  {
    version: '1.17.0',
    date: '2026-08-31',
    highlights: [
      'Neuer KI-Chat zu Supplement-Empfehlungen: Antippen einer Vorschlags-Kachel öffnet einen Chat, der mit dem schon generierten Empfehlungstext beginnt — danach lassen sich individuelle Rückfragen zu genau diesem Supplement und deinem konkreten Bedarf stellen. Die Konversation bleibt gespeichert.',
    ],
  },
  {
    version: '1.16.4',
    date: '2026-08-31',
    highlights: [
      'Supplement-Empfehlungen: "Zur Liste hinzufügen" ist jetzt ein einfaches Plus-Icon, jede Kachel trennt klar "Bedarf" (warum du das siehst) und "Wirkung" (was das Supplement grundsätzlich macht), und ein hinzugefügtes Supplement verschwindet sofort und dauerhaft aus den Vorschlägen — vorher tauchte es nach einem Neuladen wieder auf.',
    ],
  },
  {
    version: '1.16.3',
    date: '2026-08-31',
    highlights: [
      'Neue Mikronährstoff-Stufe „im Überschuss": treibt ein aktives Supplement zusammen mit der Ernährung einen Nährstoff weit über den Bedarf, prüft die KI jetzt bei jeder Empfehlung, ob es noch notwendig ist — sonst erscheint es als „Nicht mehr notwendig" mit Begründung, statt weiter als gewöhnlicher Vorschlag.',
    ],
  },
  {
    version: '1.16.2',
    date: '2026-08-31',
    highlights: [
      'Genommene Supplements fließen jetzt in die Mikronährstoff-Bilanz ein: die KI schätzt beim Hinzufügen grob, was eine Tagesdosis an Vitaminen/Mineralstoffen beisteuert, und das zählt an Tagen, an denen das Supplement abgehakt wurde, zur Statistik dazu.',
    ],
  },
  {
    version: '1.16.1',
    date: '2026-08-31',
    highlights: [
      'Mikronährstoffe setzen sich nicht mehr jede Woche zurück: statt eines starren 7-Tage-Fensters fließt jetzt die ganze Historie gewichtet ein — neuere Tage zählen stärker, ältere verblassen graduell statt schlagartig zu verschwinden.',
    ],
  },
  {
    version: '1.16.0',
    date: '2026-08-31',
    highlights: [
      'Nährwertringe im Feed: der unbefüllte Hintergrund ist jetzt ein heller, ausgeblasster Pastellton statt fast schwarz.',
      'Statistik-Diagramm: die Ziel-Linie ist jetzt eine dünne, durchgehende Linie mit dem exakten Wert direkt an ihrem rechten Ende (z. B. „2.759 kcal/Tag").',
    ],
  },
  {
    version: '1.15.8',
    date: '2026-08-31',
    highlights: [
      'Die neue Bedarfs-Kachel in Woche/Monat/Jahr zeigt jetzt zusätzlich das Kalorienziel im Kleingedruckten unter dem Über-/Unterschuss.',
    ],
  },
  {
    version: '1.15.7',
    date: '2026-08-31',
    highlights: [
      'Statistik: die erste Kachel zeigt in Woche/Monat/Jahr jetzt, ob du im Schnitt über oder unter deinem Bedarf liegst — auf den Tag gerechnet in der Woche, auf die Woche im Monat, auf den Monat im Jahr. Die Tages-Ansicht zeigt weiter die absolute Summe.',
      'Kacheln mit Liquid-Glass-Hintergrund (u. a. Ø kcal/Mahlzeit und Nährwerte in der Statistik) verschwanden gelegentlich nach dem Antippen — ein bekannter Safari-Fehler, bei dem der Blur-Hintergrund beim Loslassen manchmal nicht neu gezeichnet wurde. Behoben.',
    ],
  },
  {
    version: '1.15.6',
    date: '2026-08-31',
    highlights: [
      'Das WebGL-Glas aus v1.14.3 wieder zurück auf das bisherige Material: beim Scrollen hinkte die WebGL-Ebene der Karten-Position sichtbar hinterher (ein architekturell bedingter Versatz zwischen nativer Scroll-Kompositierung und der pro Bild neu gezeichneten Ebene). Überall wieder das bewährte, ruckelfreie CSS-Glas.',
    ],
  },
  {
    version: '1.15.5',
    date: '2026-08-31',
    highlights: [
      '„Auf Updates prüfen" in den Einstellungen sucht jetzt wirklich: die Seite lädt dabei mehrfach neu, damit eine gefundene Aktualisierung auch tatsächlich übernommen wird, bevor geprüft und angezeigt wird, ob wirklich die neueste Version läuft.',
    ],
  },
  {
    version: '1.15.4',
    date: '2026-08-31',
    highlights: [
      'Supplement-Empfehlungen: der eigentliche Fehler gefunden und behoben — ein gespeicherter Empfehlungslauf von vor Einführung der Mikronährstoff-Erkennung ließ jeden weiteren Versuch (automatisch wie manuell) dauerhaft an derselben Stelle scheitern. Aktualisiert sich jetzt wieder zuverlässig.',
    ],
  },
  {
    version: '1.15.3',
    date: '2026-08-31',
    highlights: [
      'Supplement-Empfehlungen: die Fehlermeldung beim manuellen Neu-Erstellen zeigt jetzt den tatsächlichen Fehler statt nur „Unbekannter Fehler" — hilft, einen weiterhin bestehenden Fehlerfall genauer einzugrenzen.',
    ],
  },
  {
    version: '1.15.2',
    date: '2026-08-30',
    highlights: [
      'Rezept-Vorschläge intelligenter: berücksichtigen jetzt die aktuelle Tageszeit, deine noch offenen Tagesziele und häufig verwendete Zutaten aus deiner Historie — und mischen bewusst mindestens eine ganz neue Idee zum Ausprobieren mit ein ("Neu für dich").',
    ],
  },
  {
    version: '1.15.1',
    date: '2026-08-30',
    highlights: [
      'Neu bei Rezepten: Mealprep. Skaliert ein Rezept auf eine gewünschte Menge (z.B. „6 Portionen") — mit kulinarischem Sachverstand statt reinem Dreisatz, angepasster Garzeit und Lagerungshinweis. Als eigene Version gespeichert, das Original-Rezept bleibt unverändert.',
    ],
  },
  {
    version: '1.15.0',
    date: '2026-08-30',
    highlights: [
      'Neu beim Anlegen einer Mahlzeit: Barcode scannen. Ein erkanntes Produkt wird direkt bei Open Food Facts nachgeschlagen und füllt Beschreibung sowie Nährwerte (pro 100g) automatisch aus.',
    ],
  },
  {
    version: '1.14.8',
    date: '2026-08-30',
    highlights: [
      'Neu: erwähnst du beim Speichern einer Mahlzeit ein Supplement aus dem Katalog (z.B. „...dazu noch Kreatin genommen"), schlägt die App vor, es für heute als eingenommen zu markieren — auf Wunsch mit einem Tap, nichts wird automatisch hinzugefügt oder abgehakt.',
    ],
  },
  {
    version: '1.14.7',
    date: '2026-08-30',
    highlights: [
      'Neu im Statistik-Diagramm: eine Ziel-Kalorien-Linie. Änderst du dein Tagesziel, gilt der neue Wert nur für neue Tage — bereits vergangene Tage behalten ihren damaligen Wert dauerhaft (Erklärung über das „i" neben der Linie).',
    ],
  },
  {
    version: '1.14.6',
    date: '2026-08-30',
    highlights: [
      'Nährwertringe rund 30% dicker.',
      'Farbverlauf-Fehler behoben: bei niedrigem Füllstand zeigte der Ring zwei sichtbar unterschiedlich gefärbte, überlappende Segmente statt eines glatten Verlaufs.',
    ],
  },
  {
    version: '1.14.5',
    date: '2026-08-30',
    highlights: [
      'PDF-Export umgezogen: nicht mehr auf der Statistik-Seite, sondern unter Einstellungen → Daten — dort jetzt mit eigener Zeitraum-Auswahl (Tag/Woche/Monat/Jahr).',
      'Der Supplementscore auf der Statistik-Seite führt jetzt direkt zu den Supplements (Heute-Ansicht), statt nur eine Zahl anzuzeigen.',
    ],
  },
  {
    version: '1.14.4',
    date: '2026-08-30',
    highlights: [
      'Diktieren: keine abgeschnittenen Sätze mehr bei kurzen Sprechpausen, Live-Vorschau während des Sprechens, spürbar schneller durch weniger Neustarts.',
      'Supplement-Empfehlungen: der automatische Hintergrund-Refresh und der manuelle „Jetzt neu erstellen"-Button schlugen fehl, sobald das zuletzt gewählte Modell nicht mehr verfügbar war — beide wechseln jetzt zuverlässig auf ein funktionierendes Modell.',
      'Der Hintergrund-Refresh prüft jetzt auch beim Zurückkehren zur App auf einen neuen Tag, nicht nur beim Start — wichtig, wenn die App als installiertes PWA über Mitternacht hinweg offen bleibt.',
    ],
  },
  {
    version: '1.14.3',
    date: '2026-08-30',
    highlights: [
      'Liquid Glass ist jetzt echtes 3-D-Glas statt gemalter Verläufe: Datumsleisten, Kacheln und Karten auf Feed, Statistik, Supplements, Rezepte und Einstellungen brechen den Hintergrund wirklich, mit Lichtreflex und Farbsaum.',
      'Fällt automatisch auf das bisherige Material zurück, wenn das Gerät kein WebGL kann oder „Transparenz reduzieren" aktiv ist — unverändert erkennbar als dieselbe Optik.',
      'Bedienleiste und alle Formulare/Sheets bleiben bewusst unverändert.',
    ],
  },
  {
    version: '1.14.2',
    date: '2026-08-27',
    highlights: [
      'Liquid Glass weiterentwickelt (mehr Tiefe/Lichtreflex) und auf mehr Flächen ausgeweitet: Datumsleisten, Reiter (Heute/Katalog/Vorschläge, Tag/Woche/Monat/Jahr), Supplement-Kacheln, Katalog-Suche und die Statistik-Kacheln.',
      'Katalog: „Zur Liste hinzufügen" ist jetzt ein direktes Plus/Minus statt eines Zwischenschritts.',
      'Supplement-Check-in: die Tageszeiten stehen nicht mehr ausgeschrieben daneben — nur noch Punkte, von denen sich der zur aktuellen Tageszeit passende zu einem größeren Kreis zum Abhaken vergrößert. Alle Punkte bleiben auch nachträglich antippbar.',
      '„Supplement-Treue" heißt jetzt „Supplementscore" und zeigt eine Punktzahl statt Prozent.',
    ],
  },
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
