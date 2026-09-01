# Changelog

Alle nennenswerten Änderungen an Tracke werden hier festgehalten.

Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionierung an [Semantic Versioning](https://semver.org/lang/de/): `MAJOR.MINOR.PATCH` —
MAJOR für grundlegende Neuausrichtungen, MINOR für neue Features, PATCH für Fixes/Feinschliff
ohne neue Funktion. Vor `1.0.0` (Rebrand zu „Tracke") war die App noch in aktiver Frühphase, daher
die vielen `0.x`-Schritte.

Alle Versionen ab hier sind zusätzlich als Git-Tag (`vX.Y.Z`) auf dem jeweiligen Merge-Commit hinterlegt.

Die Einträge ab 1.14.0 sind aus `src/lib/releaseNotes.ts` übernommen — der Liste, die
die App selbst unter Einstellungen → Version anzeigt. Sie wurde durchgehend gepflegt,
während diese Datei ab 1.14.0 liegen blieb; damit stehen beide wieder auf demselben
Stand. Die Git-Tags aus dem Absatz darüber sind in demselben Zeitraum ebenfalls
ausgeblieben: der letzte gesetzte ist `v1.2.1`.

## [1.20.4] - 2026-09-01

- Das Kalorien-Diagramm zeichnet sich jetzt selbst statt über eine Diagramm-Bibliothek. Der Wechsel auf die Statistik hing dadurch spürbar: der schlimmste Bildaussetzer ist von 317 auf 100 Millisekunden gefallen, und die Statistik-Seite lädt 337 KB weniger Code — bei sieben Punkten in der Wochenansicht hat sich die Bibliothek schlicht nicht gerechnet.
- Die Jahresansicht schnitt die Zahlen an der Y-Achse links ab („0.000" statt „80.000"). Die Achse richtet sich jetzt nach dem breitesten Wert.
- Die Wochenansicht beschriftet wieder alle sieben Tage statt nur jeden zweiten.

## [1.20.3] - 2026-08-31

- Bugfix: Eine einzige unvollständige Zeile im Supp-Katalog brach den Katalog-Abgleich bei jedem Start ab — unbemerkt, weil er im Hintergrund läuft. Seither kamen keine neuen Katalog-Einträge mehr an.
- Bugfix: Rezepte ohne Zutaten- oder Schrittliste rissen die ganze Kategorie- bzw. Detailseite mit runter statt nur die eine Karte leer zu lassen.
- Bugfix: Beim Zurückkehren in die App liefen zwei Supp-Vorschlagsläufe gleichzeitig los — doppelte KI-Anfragen auf dein Kontingent.
- Statistik öffnet spürbar flüssiger: die Tageswerte werden nur noch einmal statt bei jedem Neuzeichnen berechnet, und das Diagramm zeichnet sich nicht mehr Bild für Bild ein, während die Seite noch hereinkommt.
- Der Sprung in eine Rezept-Kategorie wartet nicht mehr mitten in der Animation auf nachladenden Code.
- Sheets gleiten jetzt nach unten weg, egal wie man sie schließt — über den Griff, den Hintergrund, die Zurück-Geste oder einen Speichern-Button. Bisher rutschte nur das weggewischte Sheet heraus, alle anderen blendeten an Ort und Stelle aus. Die Einstellungen verschwanden sogar von einem Bild aufs nächste.
- Bugfix: Nach dem Schließen und erneuten Öffnen eines Sheets tat der erste Zurück-Druck nichts — erst der zweite schloss es. Das wurde mit jedem Schließen um einen Druck schlimmer.
- Bugfix: Beim Schließen des Mahlzeiten-Editors landete man auf der Heute-Seite statt zurück auf der Mahlzeit, aus der man ihn geöffnet hatte.

## [1.20.2] - 2026-08-31

- Rezept, Kamera, Foto und Barcode stehen jetzt dauerhaft direkt unter dem Textfeld — Aufziehen zeigt nur noch die Vorschläge.
- Bugfix: Ein gespeicherter Eintrag ohne Titel oder Beschreibung ließ den Mahlzeiten-Editor komplett leer aufgehen. Solche Datensätze werden jetzt sauber übersprungen statt abzustürzen.

## [1.20.1] - 2026-08-31

- Der Mahlzeiten-Editor lässt sich jetzt wirklich aufziehen: hochwischen vergrößert das Sheet, das Textfeld bleibt unten stehen und Rezept-, Foto- und Barcode-Auswahl kommen darüber zum Vorschein.
- Das Antippen des Textfelds reagiert sofort statt verzögert — der Tipp wurde bisher von der Wisch-Erkennung des Sheets abgefangen.
- Übergänge zwischen den Hauptbereichen werden nicht mehr von nachladenden Seiten unterbrochen, und mehrere unnötig teure Effekte sind raus.

## [1.20.0] - 2026-08-31

- Der Mahlzeiten-Editor hat eine neue Eingabezeile im Messenger-Stil: sie startet einzeilig im Glas-Look, der blaue Senden-Button sitzt fest rechts daneben, und das Diktier-Symbol sitzt im Feld — sobald der Text umbricht, springt es unter den Senden-Button.

## [1.19.21] - 2026-08-31

- Aufräumen unter der Haube: toter Code entfernt und ein Fehler behoben, durch den beim Wechsel zwischen den Hauptbereichen eine Aufräum-Routine auf iOS wirkungslos blieb.

## [1.19.20] - 2026-08-31

- Weitere Erklärtexte sind hinter i-Buttons gewandert: Speicher, Aktualisierung, Backup, PDF-Export, Sync-Anmeldung, Bedarfsberechnung sowie die Hinweise zum Mengen-Skalieren in Mahlzeiten- und Rezept-Editor.

## [1.19.19] - 2026-08-31

- Aus "Supplement" wird überall "Supp", aus "Supplements" wird "Supps" — inklusive Seitentitel, Navigation und der Texte, die die KI schreibt.

## [1.19.18] - 2026-08-31

- Die Feed-Seite heißt jetzt "Heute" — der Titel nennt den gezeigten Tag, die doppelte Überschrift darunter ist weg.
- Kalorienbilanz: mehr gegessen als das Ziel wird jetzt rot, Ziel erreicht oder unterschritten blau (vorher andersherum).
- Der KI-Chat-Button ist jetzt überall ein blauer Kreis mit Icon statt eines Buttons mit Text.
- Supp-Detail-Sheet zeigt die Abschnitte in der Reihenfolge Dosierung, Bedarf, Wirkung.

## [1.19.17] - 2026-08-31

- Zurückwischen in Sheets führt jetzt dahin, wo man herkam: aus einem Unter-Sheet zurück ins darüberliegende Sheet, und aus einer Einstellungs-Unterseite zurück ins Einstellungen-Sheet — statt wie bisher alles zu schließen und auf der Hauptseite zu landen.

## [1.19.16] - 2026-08-31

- Bugfix: Mahlzeiten schätzen funktioniert wieder. Die App hatte der Gemini-API ein Feld geschickt, das die aktuellen Modelle nicht mehr kennen — die Absage wurde fälschlich als "API-Key ungültig" angezeigt, obwohl mit dem Key alles in Ordnung war.

## [1.19.15] - 2026-08-31

- Vorschläge: Antippen einer Empfehlungs-Karte öffnet jetzt dasselbe Detail-Sheet wie bei "Meine Liste" (Dosierung, Wirkung, Bedarf, KI-Chat-Button, plus ein Hinzufügen-Button) — die Karte selbst zeigt weiterhin alles wie gewohnt.

## [1.19.14] - 2026-08-31

- Supplements → Heute: das Detail-Sheet zeigt jetzt klar beschriftet Dosierung, Wirkung und Bedarf, dazu einen neuen KI-Chat-Button neben dem (jetzt reinen Icon-)Bearbeiten-Button.

## [1.19.13] - 2026-08-31

- Katalog: das "Zur Liste hinzufügen"-Sheet hat jetzt oben rechts einen KI-Chat-Button für Rückfragen zu diesem Supplement — der Rest des Sheets ist unverändert.

## [1.19.12] - 2026-08-31

- Supplements-Hauptseite redesignt: jedes Supplement zeigt jetzt ein farbiges, kategorie-eigenes Icon (Kraft, Ausdauer, Schlaf, Gelenke, Immunsystem, Fokus, Darm, Vitamine) statt reinem Schwarz-auf-Weiß-Text — sowohl in "Heute" als auch bei den Vorschlägen.

## [1.19.11] - 2026-08-31

- Supp-Score ist keine eigene Seite mehr, sondern ein Sheet — neu erreichbar über ein Pokal-Symbol oben rechts in Supplements (neben dem Katalog-Button), zusätzlich zur bisherigen Kachel in der Statistik.

## [1.19.10] - 2026-08-31

- Supplements: der "Katalog"-Reiter ist verschwunden — der Katalog öffnet jetzt als Sheet über ein neues Buch-Symbol oben rechts (neben Einstellungen). Im Katalog-Sheet bleibt das Suchfeld unten fixiert, während die Liste mit einer Fade darunter durchscrollt.

## [1.19.9] - 2026-08-31

- Supplements → Heute: die großen Kreise, die zur aktuellen Einnahmezeit aufploppten, sind weg — jedes Zeitfenster zeigt jetzt durchgehend denselben kleinen Punkt (offen), das Kreuz (verpasst) oder den blauen Haken (genommen), unabhängig davon, ob es gerade dran ist.

## [1.19.8] - 2026-08-31

- Medizinische Disclaimer (Supplement-Vorschläge, Supplement-Chat), die Mikronährstoff-Schätzmethode und die Kontingent-Erklärungen (Zurücksetzen, Firebase-Grenze, Genauigkeit) stehen nicht mehr dauerhaft als Fließtext auf dem Bildschirm, sondern hinter neuen i-Info-Buttons, die ein Sheet mit der Erklärung öffnen.

## [1.19.7] - 2026-08-31

- Statistik-Graph: zieht sich jetzt über die volle Kachelbreite und zeigt nur noch reine Zahlen (keine "kcal"/"Ø"/"Ziel"-Wörter mehr im Diagramm). Ein neues i-Symbol neben der Kachelüberschrift öffnet ein Sheet mit der Farb-Legende und der Ziel-Linien-Erklärung.

## [1.19.6] - 2026-08-31

- Statistik (Woche/Monat/Jahr): die erste Kachel zeigt jetzt Ziel minus Durchschnitt statt der reinen Kalorienzahl — rot bei einem Defizit, blau bei Erreichen/Überschreiten des Ziels, ganz ohne Wörter (nur die Zahl, darunter grau die reine Ziel-Kalorien-Zahl).

## [1.19.5] - 2026-08-31

- Feed und Statistik: die Vor-/Zurück-Pfeile neben der Datums-/Zeitraum-Anzeige sind jetzt ebenfalls entfernt — Datum bzw. Zeitraum ändert sich nur noch über das Kalender-Sheet (Titel-Tap in Feed, zweiter Pillen-Tap in Statistik).

## [1.19.4] - 2026-08-31

- Einstellungen → Aktualisierung: der Such-/Update-Vorgang zeigt jetzt "Suchen und installieren…" mit einem sich füllenden Ladebalken, statt nur den Reload-Zähler im Button.

## [1.19.3] - 2026-08-31

- Mahlzeiten-Schätzung beschleunigt: das interne "Denken" ist für die Nährwert-Schätzung jetzt deaktiviert (reine Nachschlage-Aufgabe, keine Vorteile durch Grübeln), und der optionale Datenbank-Abgleich verzögert die Schätzung jetzt höchstens 1,5s statt unbegrenzt.
- Neu: ein Ladebalken mit Prozentanzeige während der Mahlzeiten-Schätzung überbrückt die Wartezeit sichtbar, statt nur die Sende-Schaltfläche rotieren zu lassen.

## [1.19.2] - 2026-08-31

- Mahlzeiten-Sheet: Beim Öffnen ist jetzt zunächst nur das Texteingabefeld sichtbar. Hochscrollen im Sheet zeigt Rezept/Foto/Barcode-Optionen und Vorschläge darüber, während das Textfeld unten angedockt bleibt — wie beim iOS-Nachrichtenfeld.

## [1.19.1] - 2026-08-31

- Bugfix: Wer beim Bearbeiten einer Mahlzeit oder eines Supplements das Sheet schließt (Wischen oder Antippen des Griffs), landet jetzt wieder bei der Detailansicht statt dass alles komplett zugeht.

## [1.19.0] - 2026-08-31

- Rezepte komplett neu gestaltet: die vier Kategorien sind jetzt große, farbige Kacheln statt einer schmalen Liste, jede Rezeptkarte zeigt Zutaten-/Schritt-Anzahl in größerer Schrift, und die Rezept-Detailseite hat jetzt einen farbigen Kopfbereich sowie eigene Karten für Zutaten, Zubereitung (mit nummerierten Schritten) und Mealprep statt einer reinen Textliste.

## [1.18.2] - 2026-08-31

- Die Datums-/Zeitraum-Kachel in Feed und Statistik ist nicht mehr antippbar. Stattdessen: Auf Feed öffnet ein Tipp auf den Titel "Feed" den Kalender; in Statistik öffnet ein zweites Tippen auf die bereits aktive Pille (Tag/Woche/Monat/Jahr) den passenden Kalender/Monats-/Jahres-Picker.

## [1.18.1] - 2026-08-31

- Einstellungen sind jetzt ein Sheet statt einer eigenen Seite — öffnet sich direkt über dem Zahnrad-Symbol, egal auf welcher Hauptseite man gerade ist, und schließt sich automatisch beim Antippen einer Kategorie.
- Jede Kategorie im Einstellungen-Menü hat jetzt eine eigene Farbe statt des einheitlichen Blau — leichter zu unterscheiden, mehr Farbe im Menü.

## [1.18.0] - 2026-08-31

- Texteingaben docken jetzt Apple-Style direkt über der ausgefahrenen Tastatur an, statt weiter oben im Formular zu bleiben — betrifft alle Sheets (Mahlzeiten-Editor u.a.) sowie die Such-/Eingabefelder auf Seiten selbst.
- Angedockte Felder bekommen einen leichten 3D-Schatten; darunter scrollende Inhalte blenden per Farbverlauf aus, statt hart abgeschnitten zu werden.

## [1.17.2] - 2026-08-31

- Unter Heute öffnet ein Tippen auf ein aktives Supplement jetzt eine Kurzbeschreibung mit einer live aktualisierten Einschätzung deines aktuellen Bedarfs — Bearbeiten (Dosierung/Zeiten) ist von dort aus weiterhin einen Tap entfernt.

## [1.17.1] - 2026-08-31

- Supplementscore ist jetzt fortlaufend statt an den Statistik-Zeitraum gebunden — er setzt sich nicht mehr zurück, egal welche Ansicht (Tag/Woche/Monat/Jahr) gerade offen ist.
- Neue Supp-Score-Seite: Antippen des Scores öffnet jetzt eine eigene Seite mit Aufschlüsselung pro Supplement und einer Kalenderübersicht, statt auf die Heute-Ansicht zu springen.

## [1.17.0] - 2026-08-31

- Neuer KI-Chat zu Supplement-Empfehlungen: Antippen einer Vorschlags-Kachel öffnet einen Chat, der mit dem schon generierten Empfehlungstext beginnt — danach lassen sich individuelle Rückfragen zu genau diesem Supplement und deinem konkreten Bedarf stellen. Die Konversation bleibt gespeichert.

## [1.16.4] - 2026-08-31

- Supplement-Empfehlungen: "Zur Liste hinzufügen" ist jetzt ein einfaches Plus-Icon, jede Kachel trennt klar "Bedarf" (warum du das siehst) und "Wirkung" (was das Supplement grundsätzlich macht), und ein hinzugefügtes Supplement verschwindet sofort und dauerhaft aus den Vorschlägen — vorher tauchte es nach einem Neuladen wieder auf.

## [1.16.3] - 2026-08-31

- Neue Mikronährstoff-Stufe „im Überschuss": treibt ein aktives Supplement zusammen mit der Ernährung einen Nährstoff weit über den Bedarf, prüft die KI jetzt bei jeder Empfehlung, ob es noch notwendig ist — sonst erscheint es als „Nicht mehr notwendig" mit Begründung, statt weiter als gewöhnlicher Vorschlag.

## [1.16.2] - 2026-08-31

- Genommene Supplements fließen jetzt in die Mikronährstoff-Bilanz ein: die KI schätzt beim Hinzufügen grob, was eine Tagesdosis an Vitaminen/Mineralstoffen beisteuert, und das zählt an Tagen, an denen das Supplement abgehakt wurde, zur Statistik dazu.

## [1.16.1] - 2026-08-31

- Mikronährstoffe setzen sich nicht mehr jede Woche zurück: statt eines starren 7-Tage-Fensters fließt jetzt die ganze Historie gewichtet ein — neuere Tage zählen stärker, ältere verblassen graduell statt schlagartig zu verschwinden.

## [1.16.0] - 2026-08-31

- Nährwertringe im Feed: der unbefüllte Hintergrund ist jetzt ein heller, ausgeblasster Pastellton statt fast schwarz.
- Statistik-Diagramm: die Ziel-Linie ist jetzt eine dünne, durchgehende Linie mit dem exakten Wert direkt an ihrem rechten Ende (z. B. „2.759 kcal/Tag").

## [1.15.8] - 2026-08-31

- Die neue Bedarfs-Kachel in Woche/Monat/Jahr zeigt jetzt zusätzlich das Kalorienziel im Kleingedruckten unter dem Über-/Unterschuss.

## [1.15.7] - 2026-08-31

- Statistik: die erste Kachel zeigt in Woche/Monat/Jahr jetzt, ob du im Schnitt über oder unter deinem Bedarf liegst — auf den Tag gerechnet in der Woche, auf die Woche im Monat, auf den Monat im Jahr. Die Tages-Ansicht zeigt weiter die absolute Summe.
- Kacheln mit Liquid-Glass-Hintergrund (u. a. Ø kcal/Mahlzeit und Nährwerte in der Statistik) verschwanden gelegentlich nach dem Antippen — ein bekannter Safari-Fehler, bei dem der Blur-Hintergrund beim Loslassen manchmal nicht neu gezeichnet wurde. Behoben.

## [1.15.6] - 2026-08-31

- Das WebGL-Glas aus v1.14.3 wieder zurück auf das bisherige Material: beim Scrollen hinkte die WebGL-Ebene der Karten-Position sichtbar hinterher (ein architekturell bedingter Versatz zwischen nativer Scroll-Kompositierung und der pro Bild neu gezeichneten Ebene). Überall wieder das bewährte, ruckelfreie CSS-Glas.

## [1.15.5] - 2026-08-31

- „Auf Updates prüfen" in den Einstellungen sucht jetzt wirklich: die Seite lädt dabei mehrfach neu, damit eine gefundene Aktualisierung auch tatsächlich übernommen wird, bevor geprüft und angezeigt wird, ob wirklich die neueste Version läuft.

## [1.15.4] - 2026-08-31

- Supplement-Empfehlungen: der eigentliche Fehler gefunden und behoben — ein gespeicherter Empfehlungslauf von vor Einführung der Mikronährstoff-Erkennung ließ jeden weiteren Versuch (automatisch wie manuell) dauerhaft an derselben Stelle scheitern. Aktualisiert sich jetzt wieder zuverlässig.

## [1.15.3] - 2026-08-31

- Supplement-Empfehlungen: die Fehlermeldung beim manuellen Neu-Erstellen zeigt jetzt den tatsächlichen Fehler statt nur „Unbekannter Fehler" — hilft, einen weiterhin bestehenden Fehlerfall genauer einzugrenzen.

## [1.15.2] - 2026-08-30

- Rezept-Vorschläge intelligenter: berücksichtigen jetzt die aktuelle Tageszeit, deine noch offenen Tagesziele und häufig verwendete Zutaten aus deiner Historie — und mischen bewusst mindestens eine ganz neue Idee zum Ausprobieren mit ein ("Neu für dich").

## [1.15.1] - 2026-08-30

- Neu bei Rezepten: Mealprep. Skaliert ein Rezept auf eine gewünschte Menge (z.B. „6 Portionen") — mit kulinarischem Sachverstand statt reinem Dreisatz, angepasster Garzeit und Lagerungshinweis. Als eigene Version gespeichert, das Original-Rezept bleibt unverändert.

## [1.15.0] - 2026-08-30

- Neu beim Anlegen einer Mahlzeit: Barcode scannen. Ein erkanntes Produkt wird direkt bei Open Food Facts nachgeschlagen und füllt Beschreibung sowie Nährwerte (pro 100g) automatisch aus.

## [1.14.8] - 2026-08-30

- Neu: erwähnst du beim Speichern einer Mahlzeit ein Supplement aus dem Katalog (z.B. „...dazu noch Kreatin genommen"), schlägt die App vor, es für heute als eingenommen zu markieren — auf Wunsch mit einem Tap, nichts wird automatisch hinzugefügt oder abgehakt.

## [1.14.7] - 2026-08-30

- Neu im Statistik-Diagramm: eine Ziel-Kalorien-Linie. Änderst du dein Tagesziel, gilt der neue Wert nur für neue Tage — bereits vergangene Tage behalten ihren damaligen Wert dauerhaft (Erklärung über das „i" neben der Linie).

## [1.14.6] - 2026-08-30

- Nährwertringe rund 30% dicker.
- Farbverlauf-Fehler behoben: bei niedrigem Füllstand zeigte der Ring zwei sichtbar unterschiedlich gefärbte, überlappende Segmente statt eines glatten Verlaufs.

## [1.14.5] - 2026-08-30

- PDF-Export umgezogen: nicht mehr auf der Statistik-Seite, sondern unter Einstellungen → Daten — dort jetzt mit eigener Zeitraum-Auswahl (Tag/Woche/Monat/Jahr).
- Der Supplementscore auf der Statistik-Seite führt jetzt direkt zu den Supplements (Heute-Ansicht), statt nur eine Zahl anzuzeigen.

## [1.14.4] - 2026-08-30

- Diktieren: keine abgeschnittenen Sätze mehr bei kurzen Sprechpausen, Live-Vorschau während des Sprechens, spürbar schneller durch weniger Neustarts.
- Supplement-Empfehlungen: der automatische Hintergrund-Refresh und der manuelle „Jetzt neu erstellen"-Button schlugen fehl, sobald das zuletzt gewählte Modell nicht mehr verfügbar war — beide wechseln jetzt zuverlässig auf ein funktionierendes Modell.
- Der Hintergrund-Refresh prüft jetzt auch beim Zurückkehren zur App auf einen neuen Tag, nicht nur beim Start — wichtig, wenn die App als installiertes PWA über Mitternacht hinweg offen bleibt.

## [1.14.3] - 2026-08-30

- Liquid Glass ist jetzt echtes 3-D-Glas statt gemalter Verläufe: Datumsleisten, Kacheln und Karten auf Feed, Statistik, Supplements, Rezepte und Einstellungen brechen den Hintergrund wirklich, mit Lichtreflex und Farbsaum.
- Fällt automatisch auf das bisherige Material zurück, wenn das Gerät kein WebGL kann oder „Transparenz reduzieren" aktiv ist — unverändert erkennbar als dieselbe Optik.
- Bedienleiste und alle Formulare/Sheets bleiben bewusst unverändert.

## [1.14.2] - 2026-08-27

- Liquid Glass weiterentwickelt (mehr Tiefe/Lichtreflex) und auf mehr Flächen ausgeweitet: Datumsleisten, Reiter (Heute/Katalog/Vorschläge, Tag/Woche/Monat/Jahr), Supplement-Kacheln, Katalog-Suche und die Statistik-Kacheln.
- Katalog: „Zur Liste hinzufügen" ist jetzt ein direktes Plus/Minus statt eines Zwischenschritts.
- Supplement-Check-in: die Tageszeiten stehen nicht mehr ausgeschrieben daneben — nur noch Punkte, von denen sich der zur aktuellen Tageszeit passende zu einem größeren Kreis zum Abhaken vergrößert. Alle Punkte bleiben auch nachträglich antippbar.
- „Supplement-Treue" heißt jetzt „Supplementscore" und zeigt eine Punktzahl statt Prozent.

## [1.14.1] - 2026-08-27

- Der Farbwechsel im Hintergrund beim Seitenwechsel läuft jetzt weich statt hart.
- Der blaue Farbverlauf oben nimmt jetzt bis zur Bildschirmhälfte ein.
- Nährwertringe im Hintergrund: weniger verschwommen, deutlicher sichtbar.
- Alle bisher "provisorischen" Farben (Protein, Fehler, mehrere Mikronährstoffe) kommen jetzt ebenfalls direkt aus der erweiterten Farbpalette.

## [1.14.0] - 2026-08-27

- Hintergrund: verschwommene Nährwertringe wie auf dem App-Icon unten rechts, kräftigerer Farbverlauf am oberen Rand, "flüssigeres" Liquid Glass mit Lichtreflex und leichter Eigenbewegung.
- Farben an die hochgeladene Palette angeglichen: Feed exakt #1E90FF, Rezepte/Supplements heller, Statistik dunkler.
- Statistik: Mikronährstoff-Kacheln jetzt nach Wichtigkeit sortiert (wichtigster Nährstoff oben).

## [1.13.0] - 2026-08-26

### Mikronährstoffe
- Balken-Design überarbeitet, nach Nutzer-Feedback und Referenzbild: über
  jedem Balken steht jetzt die kurze Abkürzung (Elementsymbol wo vorhanden —
  Fe, Mg, Ca, Zn, K, I — sonst die übliche Vitamin-Kurzform: D, B12, B9, C)
  in der jeweiligen Akzentfarbe des Nährstoffs, darunter der ausgeschriebene
  deutsche Name, klein und ausgegraut. Keine Prozentzahlen mehr.
- Neue Balken-Darstellung statt Füllstand: ein in der jeweiligen
  Nährstofffarbe hell-zu-dunkel verlaufender Track (immer voll sichtbar) mit
  einem Zeiger, der je nach 7-Tage-Schnitt weiter links (wenig) oder rechts
  (viel) sitzt — statt eines sich füllenden Balkens mit
  gering/durchschnittlich/gut-Text am Ende. Der qualitative Text bleibt für
  Screenreader erhalten (sr-only), ist aber nicht mehr sichtbar aufgedruckt.
  10 neue, feste Akzentfarben (eine pro Nährstoff, keine der vier
  Makro-Farben doppelt verwendet, da die Makro-Ringe auf derselben Seite
  direkt daneben stehen).
- Der Track ist in drei Segmente mit einer Haarlinien-Lücke bei je einem
  Drittel geteilt, damit unteres/mittleres/oberes Drittel erkennbar sind —
  gewählt nach Vergleich von vier durchgespielten Ansätzen (Lücken-Segmente,
  zweifarbige Striche, Lineal-Punkte, Zeiger-Zustand): die Lücke braucht
  anders als eine aufgemalte Markierung keinen Kontrast gegen den Verlauf,
  weil nichts auf ihm liegt — funktioniert dadurch strukturell gegen alle
  zehn Nährstofffarben, ohne pro Farbe geprüft werden zu müssen.
- Statistik: Reihenfolge zurückgetauscht — Makronährstoffe wieder oben,
  Mikronährstoffe darunter (Tag- und Nährstoff-Ansicht).
- Bereits vor diesem Feature eingetragene Mahlzeiten fließen jetzt ebenfalls
  in die Mikronährstoff-Auswertung ein: eine neue, gezielt günstige
  Gemini-Sammelschätzung (nur Titel/Beschreibung, mehrere Mahlzeiten pro
  Anfrage, keine Zutatenaufschlüsselung) füllt fehlende Werte im Hintergrund
  nach, in Schüben pro App-Start, bis alle Mahlzeiten erfasst sind.

## [1.12.1] - 2026-08-26

### Fixes
- Bedienleiste: das zuletzt aktive Symbol (z. B. Feed) blieb weiß eingefärbt,
  sobald man über den Header zu Einstellungen wechselte — obwohl die blaue
  Pille selbst dabei korrekt verschwand. Ursache: die geteilte
  Positionsangabe für Pille und Symbol-Einfärbung wird beim Verlassen der
  vier Hauptbereiche bewusst nicht zurückgesetzt (sonst würde die
  Seiten-Wisch-Position springen), aber die Symbol-Einfärbung folgte dieser
  eingefrorenen Position ohne eigene Prüfung. Jetzt schließt sich ein
  zusätzliches Gate, sobald kein Hauptbereich aktiv ist, und öffnet sich
  wieder, sobald ein Tab in der Bedienleiste angetippt wird.
- Einstellungen → Aktualisierung: Der zweite Button ("Neue Version
  installieren und neu laden") konnte nie erscheinen — die App registriert
  den Service Worker mit `registerType: 'autoUpdate'`, wobei eine gefundene
  neue Version sich selbstständig installiert und neu lädt, ohne dass die
  dafür nötige Bedingung (`needRefresh`) in diesem Modus jemals eintritt.
  Toter Code entfernt. Der verbleibende "Auf Updates prüfen"-Button ist
  echt und funktioniert (`registration.update()` fragt den Server aktiv ab)
  und erkennt jetzt über einen `updatefound`-Listener zuverlässig, ob eine
  neue Version gefunden wurde, statt das nur zu behaupten.

## [1.12.0] - 2026-08-26

### Mikronährstoffe
- Neue Kernliste von 10 Mikronährstoffen (Vitamin D, B12, Folat, C, Calcium,
  Eisen, Magnesium, Zink, Kalium, Jod) — ausgewählt nach DGE-„kritische
  Nährstoffe" plus breiter Alltagsrelevanz. Gemini schätzt sie pro Mahlzeit
  grob mit (gleicher Aufruf wie die bestehende Kalorien-/Makro-Schätzung,
  kein zusätzlicher Kontingent-Verbrauch), Rezepte ebenso.
- Bewusst KEINE exakten Werte oder Prozentangaben in der Oberfläche —
  stattdessen eine Einordnung in gut/durchschnittlich/unterrepräsentiert je
  Nährstoff, gemittelt über die letzten 7 Tage mit geschätzten Mahlzeiten
  (entspricht der DACH-Referenzwert-Logik: wochenweise erreicht, nicht
  tagesgenau). Ein Text-KI-Schätzwert als scheinbar exakte Zahl wäre falsche
  Präzision gewesen; die Bänder sind ehrlicher.
- Referenzwerte nach DACH, geschlechtsspezifisch nur bei Eisen (gut belegter
  ~2-facher Unterschied) — kein Ziel-basiertes (Abnehmen/Muskelaufbau/…)
  Anpassen der anderen neun, weil die Evidenz dafür zu dünn ist, um sie als
  Fakt auszuspielen.
- Mahlzeit-Detail: neue "Gute Quelle für"-Badges — welche Mikronährstoffe
  diese eine Mahlzeit spürbar beisteuert (mind. ein Drittel des Tagesbedarfs).
- Statistik: neue, kompakte Mikronährstoff-Balken (Tag- und Nährstoff-
  Ansicht), oberhalb der bestehenden Makronährstoff-Ringe — Makros bleiben
  vollständig erhalten, rutschen aber eine Stufe tiefer.
- Supplement-Empfehlungen beziehen jetzt auch unterrepräsentierte
  Mikronährstoffe als eigenständigen Grund mit ein, nicht nur die
  Makro-Lücken wie bisher.

## [1.11.0] - 2026-08-26

### Feed
- Neue Glühbirne oben rechts (neben Einstellungen und "+"): "Was jetzt
  essen"-Tipps. Kurze, konkrete Zutatenkategorien (z. B. "Thunfisch,
  Hähnchenbrust oder Hüttenkäse") statt vollständiger Rezepte, ausgerichtet
  an der verbleibenden Tageslücke (kcal/Protein/Kohlenhydrate/Fett), dem
  bereits Gegessenen und der aktuellen Tageszeit — Snack-Ideen sind dabei
  jederzeit erlaubt, andere Vorschläge richten sich nach Frühstück/Mittag/
  Nachmittag/Abend. Aktualisiert sich automatisch bei jedem Wechsel dieser
  vier Tageszeit-Phasen, nicht bei jedem Öffnen.

## [1.10.0] - 2026-08-26

### Mahlzeit-Editor
- Vorschläge lassen sich jetzt statt direkt zu übernehmen auch bearbeiten:
  ein Stift-Symbol pro Vorschlag füllt die ursprüngliche Beschreibung ins
  Textfeld statt der gespeicherten Nährwerte, damit z. B. "das übliche
  Frühstück, aber mit einer Banane dazu" neu geschätzt werden kann, statt
  die alten Zahlen unverändert zu übernehmen.

## [1.9.0] - 2026-08-25

### Einstellungen
- Neuer Reiter „Version & Neues": zeigt die installierte Version und was jede
  Version gebracht hat.
- Neuer Reiter „Aktualisierung": fragt den Service Worker, ob eine neuere
  Version bereitsteht, und installiert sie auf Knopfdruck.
- Neuer Reiter „Kontingent": Balken pro Gemini-Modell und für Firebase-
  Anmeldemails, blau bis 85%, danach rot. Ehrlich beschriftet — gezählt wird,
  was dieses Gerät sendet, weil keine der beiden Schnittstellen den echten
  Verbrauch herausgibt.
- Gemini rotiert automatisch durch mehrere Modelle, wenn ein Tageskontingent
  aufgebraucht ist, und merkt sich das bis zum Zurücksetzen. Die in den
  Einstellungen gewählte Modell-Präferenz wird dabei nicht mehr überschrieben.

### Design
- Alle Trefferflächen auf mindestens 44pt.
- Farben pro Mahlzeit-Typ, Apfel statt Stern für Snack.
- Statistik: Punkt-Diagramm mit Trendlinie und Nährwert-Detail je Punkt.
- Mahlzeit-Editor: Vorschläge mit Ring-Badges, Galerie-Button, breiteres
  Textfeld, kein seitlicher Überlauf mehr.

## [1.4.3] - 2026-08-25

### Sonstiges
- Formale Versionierung eingeführt: `package.json`-Version, dieses Changelog und rückwirkende
  Git-Tags für die gesamte bisherige Historie.

## [1.4.2] - 2026-08-25
- Fehlermeldungen app-weit durchgegangen: Firestore-Sync-Fehler, Diktier-/Spracherkennungsfehler
  und Speicher-Fehler zeigen jetzt überall eine erklärende Ursache statt generischem Text. (#34)

## [1.4.1] - 2026-08-25
- Sync-Anmeldung: echter Firebase-Fehlercode (z. B. „Tageskontingent für Anmelde-E-Mails
  aufgebraucht") statt geratener, unspezifischer Meldung. (#33)

## [1.4.0] - 2026-08-25
- Neues App-Icon: helles Design mit angeschnittenen, teils überlappenden Aktivitätsringen. (#32)

## [1.3.1] - 2026-08-25
- Farbschema-Feedback umgesetzt: Mint/Cyan statt der zuvor lila/fliederfarbenen Akzente, das
  Farbschema jetzt sichtbarer im UI (Icon-Badges, Tab-Pille, Karten-Ränder), harte Kante im
  oberen Farbverlauf behoben. (#31)

## [1.3.0] - 2026-08-25
- Eigenes Farbschema pro Hauptbereich: Feed, Rezepte, Supplements und Statistik bekommen je einen
  eigenen Akzent, Funktionstasten bleiben grundsätzlich Blau. (#30)

## [1.2.1] - 2026-08-25
- Firebase-Projekt fest in der App hinterlegt, muss nicht mehr manuell eingefügt werden. (#29)

## [1.2.0] - 2026-08-25
- Rezepte: „Zuletzt" (aus geloggten Mahlzeiten) und KI-„Vorschläge" unterhalb der Kategorien. (#28)

## [1.1.1] - 2026-08-25
- Supplements-Bereich nach Apple-Design-Review überarbeitet. (#27)

## [1.1.0] - 2026-08-25
- Neues Supplements-Feature: Katalog, tägliche Checkliste, KI-Empfehlungen zur Einnahmezeit. (#26)

## [1.0.0] - 2026-08-25
- Umbenennung zu „Tracke", neues Ring-Icon, Griffe an allen Sheets, große Design-Review-Runde.
  Erste Version unter dem heutigen Produktnamen. (#25)

## [0.11.0] - 2026-08-24
- Apple-Design-Überarbeitung: echte Federphysik statt CSS-Transitions für flüssigere Animationen. (#23)

## [0.10.0] - 2026-08-24
- Automatischer Gemini-Modell-Fallback, blauer Verlauf auf den Hauptseiten. (#21)

## [0.9.4] - 2026-08-24
- Fix: Sync brach bei `undefined`-Feldern lautlos ab. (#20)

## [0.9.3] - 2026-08-24
- Sync: Workaround für die iOS-Speichertrennung zwischen Safari und der Home-Bildschirm-App. (#19)

## [0.9.2] - 2026-08-24
- Sync: Gemini-API-Key wird jetzt ebenfalls synchronisiert. (#18)

## [0.9.1] - 2026-08-24
- Fix: Firebase-Config-Paste erkennt jetzt auch den vollständigen Konsolen-Code-Block. (#17)

## [0.9.0] - 2026-08-24
- Neues Rezepte-Feature, größere Nährwert-Datenbank, geräteübergreifender Sync, kompaktere Ringe. (#16)

## [0.8.4] - 2026-08-24
- Kalender-Popups: Datum/Monat/Jahr direkt anklickbar. (#15)

## [0.8.3] - 2026-08-24
- Aktivitätsringe: Farbverlauf, echter Überlappungs-Effekt, 0%-Ring wieder sichtbar. (#14)

## [0.8.2] - 2026-08-24
- Ring-Design an Apple-Aktivitätsring-Referenzbilder angeglichen. (#13)

## [0.8.1] - 2026-08-24
- Einstellungen als iOS-artiges Kategorie-Menü. (#12)

## [0.8.0] - 2026-08-24
- Signature-Ring-Design überall, Wrap-Effekt-Fix, Icons aus PDF extrahiert. (#11)

## [0.7.1] - 2026-08-24
- Datum einer Mahlzeit im MealEditor nachträglich änderbar. (#10)

## [0.7.0] - 2026-08-24
- Nährwerts-Ringe überall, neue Icons/Farben, Plus-Button in der Bottom-Nav. (#9)

## [0.6.0] - 2026-08-24
- Speicher-Bug-Fix, Kalorien-Regler, Ring-Diagramme, Dark Mode, neue Icons. (#8)

## [0.5.0] - 2026-08-24
- Scroll-Fix, neue Makro-Icons, Zutatenmengen editierbar, globaler FAB. (#7)

## [0.4.0] - 2026-08-23
- Zweite Feedback-Runde: Piktogramm-Icons, zweistufiger Mahlzeit-Editor, diverse Fixes.

## [0.3.0] - 2026-08-23
- Feedback-Runde: grüner Akzent, Mahlzeit-Detailansicht, TDEE-Ziele, diverse Fixes.

## [0.2.2] - 2026-08-23
- Fix: Lazy-geladene Chunks erholen sich automatisch, wenn ein Redeploy alte Hashes ungültig macht.

## [0.2.1] - 2026-08-23
- Persistenter Browser-Speicher angefragt, damit API-Key und Mahlzeiten erhalten bleiben.

## [0.2.0] - 2026-08-23
- PDF-Tagebuch-Export, UI im hellen Apple-artigen Liquid-Glass-Stil neugestaltet.

## [0.1.0] - 2026-08-23
- Erste Version: Ernährungstracker-PWA mit KI-gestützter Mahlzeiten-Schätzung per Gemini.
