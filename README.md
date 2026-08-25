# Tracke

Ein Ernährungstracker: Mahlzeiten per Text, Diktat oder Foto beschreiben – eine KI (Google
Gemini, kostenloses Kontingent) schätzt daraus die Nährwerte. Läuft komplett im Browser (als
installierbare PWA), alle Daten bleiben lokal auf deinem Gerät.

## Funktionen

- Mahlzeit per Tastatur, Diktierfunktion (Browser-Spracherkennung) oder Foto erfassen
- Gemini schätzt Kalorien, Protein, Kohlenhydrate und Fett – manuell nachbearbeitbar
- Tages-Feed, gegliedert nach Frühstück / Mittag / Abend / Snack
- Wochen-, Monats- und Jahresübersicht als Diagramm inkl. Tagesdurchschnitt
- Als App auf dem Homescreen installierbar (PWA)
- Backup-Export/-Import als JSON

## Einmalige Einrichtung: Google Gemini API-Key (kostenlos)

Die Nährwertschätzung läuft über die Gemini-API im kostenlosen Kontingent von Google. Dafür
brauchst du einen eigenen, ebenfalls kostenlosen API-Key:

1. Gehe zu [aistudio.google.com/apikey](https://aistudio.google.com/apikey) und melde dich mit
   einem Google-Konto an (kein Zahlungsmittel nötig).
2. Erstelle dort einen neuen API-Key und kopiere ihn.
3. Öffne die App → **Einstellungen** → füge den Key ein → **Speichern**.

Der Key wird ausschließlich lokal in deinem Browser gespeichert (`localStorage`) und nur
direkt an `generativelanguage.googleapis.com` gesendet – nie an einen anderen Server.

> **Hinweis zur Sicherheit:** Da die App ohne eigenes Backend läuft, ruft dein Browser die
> Gemini-API direkt auf. Der Key ist dadurch im Netzwerk-Tab deines eigenen Browsers sichtbar.
> Für eine private Einzelnutzer-App ist das ein bewusst akzeptierter Trade-off gegen den
> Aufwand eines eigenen Backends. Teile den Key nicht.

> **Hinweis zum Gratis-Kontingent:** Das kostenlose Kontingent ist rate-limitiert (Anfragen pro
> Minute/Tag) und Google kann laut Nutzungsbedingungen Inhalte aus der kostenlosen Stufe zur
> Produktverbesserung verwenden. Für eine rein private Nutzung mit wenigen Mahlzeiten pro Tag
> reicht es normalerweise gut aus. Falls die Schätzung mit "Rate-Limit" fehlschlägt, einfach
> kurz warten und erneut versuchen. Google benennt Modelle gelegentlich um – falls die
> Schätzung mit "Modell nicht gefunden" fehlschlägt, in den Einstellungen den aktuellen
> Modellnamen von [ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models)
> eintragen.

## Lokale Entwicklung

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deployment

Ein GitHub-Actions-Workflow (`.github/workflows/deploy.yml`) baut die App bei jedem Push auf
`main` und deployt sie automatisch auf GitHub Pages. Voraussetzung: **Settings → Pages →
Source: GitHub Actions** ist im Repository aktiviert (einmalig).

## Datenhaltung

Alle Mahlzeiten liegen ausschließlich in IndexedDB im Browser (keine Anmeldung, kein Server,
kein Sync zwischen Geräten). Exportiere regelmäßig ein Backup über
**Einstellungen → Backup exportieren**, falls du den Browser wechselst oder Speicher leerst.

Die App fordert beim Start über die [Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API)
"dauerhaften Speicher" an (`navigator.storage.persist()`), damit der Browser localStorage
(API-Key) und IndexedDB (Mahlzeiten) nicht automatisch aufräumt — kostenlos, ohne Backend, per
Browser-Bordmittel. Status und ein manueller Retry-Button finden sich unter
**Einstellungen → Daten**. Auf iOS ist eine zum Homescreen hinzugefügte App laut Apple ohnehin
von Safaris automatischer 7-Tage-Bereinigung ausgenommen; die Anfrage ist dort ein zusätzliches
Sicherheitsnetz. Eine hundertprozentige Garantie gibt es bei rein clientseitiger Speicherung
nie (z.B. bei manuellem "Website-Daten löschen" oder Neuinstallation der App) — dafür ist der
JSON-Backup-Export da.
