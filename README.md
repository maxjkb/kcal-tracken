# Kcal Tracker

Ein Ernährungstracker: Mahlzeiten per Text, Diktat oder Foto beschreiben – eine KI (Claude)
schätzt daraus die Nährwerte. Läuft komplett im Browser (als installierbare PWA), alle Daten
bleiben lokal auf deinem Gerät.

## Funktionen

- Mahlzeit per Tastatur, Diktierfunktion (Browser-Spracherkennung) oder Foto erfassen
- Claude schätzt Kalorien, Protein, Kohlenhydrate und Fett – manuell nachbearbeitbar
- Tages-Feed, gegliedert nach Frühstück / Mittag / Abend / Snack
- Wochen-, Monats- und Jahresübersicht als Diagramm inkl. Tagesdurchschnitt
- Als App auf dem Homescreen installierbar (PWA)
- Backup-Export/-Import als JSON

## Einmalige Einrichtung: Anthropic API-Key

Die Nährwertschätzung läuft über die Claude-API. Dafür brauchst du einen eigenen API-Key:

1. Gehe zu [console.anthropic.com](https://console.anthropic.com/settings/keys) und erstelle
   einen Account (falls noch keiner vorhanden ist).
2. Lege unter **Settings → API Keys** einen neuen Key an und kopiere ihn.
3. Hinterlege ein kleines Guthaben unter **Settings → Billing** (die Nutzung wird nach
   Verbrauch abgerechnet, für private Nutzung typischerweise wenige Cent pro Mahlzeit).
4. Öffne die App → **Einstellungen** → füge den Key ein → **Speichern**.

Der Key wird ausschließlich lokal in deinem Browser gespeichert (`localStorage`) und nur
direkt an `api.anthropic.com` gesendet – nie an einen anderen Server.

> **Hinweis zur Sicherheit:** Da die App ohne eigenes Backend läuft, ruft dein Browser die
> Claude-API direkt auf. Der Key ist dadurch im Netzwerk-Tab deines eigenen Browsers sichtbar.
> Für eine private Einzelnutzer-App ist das ein bewusst akzeptierter Trade-off gegen den
> Aufwand eines eigenen Backends. Teile den Key nicht und nutze am besten einen Key mit
> Ausgabenlimit.

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
