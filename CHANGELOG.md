# Changelog

Alle nennenswerten Änderungen an Tracke werden hier festgehalten.

Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionierung an [Semantic Versioning](https://semver.org/lang/de/): `MAJOR.MINOR.PATCH` —
MAJOR für grundlegende Neuausrichtungen, MINOR für neue Features, PATCH für Fixes/Feinschliff
ohne neue Funktion. Vor `1.0.0` (Rebrand zu „Tracke") war die App noch in aktiver Frühphase, daher
die vielen `0.x`-Schritte.

Alle Versionen ab hier sind zusätzlich als Git-Tag (`vX.Y.Z`) auf dem jeweiligen Merge-Commit hinterlegt.

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
