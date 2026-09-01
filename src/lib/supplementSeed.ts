import { db, newSupplementId, type Supplement, type SupplementCategory } from './db'

export const SUPPLEMENT_CATEGORY_ORDER: SupplementCategory[] = [
  'build_muscle',
  'endurance',
  'recovery',
  'joints',
  'immune',
  'cognition',
  'gut',
  'general_health',
]

/**
 * The built-in supplement catalog.
 *
 * Scope is deliberately *ingredient* level, not product level: "Kreatin
 * (Monohydrat)", never "ESN Ultrapure Creatine 500g". A product database
 * would date instantly, differ by country, and answer the wrong question —
 * the app is asking "does this belong in your routine", not "which tub to
 * buy". The one large public alternative, the NIH DSLD, is 50k US brand
 * labels in English, which is that wrong shape at scale.
 *
 * Restricted to supplements with a real evidence base or at least
 * long-established mainstream use, with broad population dose ranges from the
 * literature. No proprietary blends, no megadoses, no exotica. The dosages
 * are general orientation, not individual advice — see the disclaimer on the
 * Supplements page.
 *
 * `key` is the stable identity used by the migration below; renaming a `name`
 * is therefore safe, while changing a `key` would re-add the entry as a
 * duplicate. Names still have to stay unique, since the migration also
 * matches by name to adopt entries seeded before keys existed.
 */
interface SeedSupplement {
  key: string
  name: string
  category: SupplementCategory
  description: string
  typicalDosage: string
}

const SEED: SeedSupplement[] = [
  // --- Muskelaufbau & Kraft ---
  { key: 'protein-powder', name: 'Proteinpulver', category: 'build_muscle', description: 'Deckt den Proteinbedarf, wenn er über die Ernährung allein schwer zu erreichen ist.', typicalDosage: '20–40 g, z.B. nach dem Training oder als Mahlzeitenergänzung' },
  { key: 'whey-isolate', name: 'Whey-Isolat', category: 'build_muscle', description: 'Stärker gefiltertes Molkenprotein — sehr wenig Laktose und Fett, schnell verfügbar.', typicalDosage: '20–40 g pro Portion' },
  { key: 'casein', name: 'Casein', category: 'build_muscle', description: 'Langsam verdauliches Milchprotein, oft abends oder als sättigende Zwischenmahlzeit.', typicalDosage: '20–40 g, häufig vor dem Schlafen' },
  { key: 'vegan-protein', name: 'Veganes Proteinpulver', category: 'build_muscle', description: 'Meist Erbsen-Reis-Mischung — pflanzliche Alternative mit vollständigem Aminosäureprofil.', typicalDosage: '25–40 g pro Portion' },
  { key: 'creatine', name: 'Kreatin (Monohydrat)', category: 'build_muscle', description: 'Eines der am besten belegten Supps für Kraft- und Muskelaufbau — wirkt unabhängig vom Trainingstag.', typicalDosage: '3–5 g täglich, auch an trainingsfreien Tagen' },
  { key: 'eaa', name: 'EAA (essenzielle Aminosäuren)', category: 'build_muscle', description: 'Alle acht essenziellen Aminosäuren — sinnvoll vor allem bei insgesamt knapper Proteinzufuhr.', typicalDosage: '10–15 g rund ums Training' },
  { key: 'bcaa', name: 'BCAA', category: 'build_muscle', description: 'Leucin, Isoleucin, Valin. Bei ausreichender Gesamtproteinzufuhr meist entbehrlich — EAA sind die vollständigere Wahl.', typicalDosage: '5–10 g rund ums Training' },
  { key: 'leucine', name: 'L-Leucin', category: 'build_muscle', description: 'Die Aminosäure, die den Muskelaufbau-Reiz am stärksten auslöst — ergänzend zu proteinarmen Mahlzeiten.', typicalDosage: '2–3 g zu einer Mahlzeit' },
  { key: 'hmb', name: 'HMB', category: 'build_muscle', description: 'Leucin-Metabolit, der Muskelabbau entgegenwirken soll. Vor allem bei Untrainierten oder in Diätphasen untersucht.', typicalDosage: '3 g täglich, aufgeteilt' },
  { key: 'weight-gainer', name: 'Weight Gainer', category: 'build_muscle', description: 'Kohlenhydrat-Protein-Mischung für Kalorienüberschuss, wenn feste Nahrung mengenmäßig schwerfällt.', typicalDosage: '1 Portion (300–600 kcal) als Ergänzung' },

  // --- Ausdauer & Leistung ---
  { key: 'beta-alanine', name: 'Beta-Alanin', category: 'endurance', description: 'Puffert Muskelübersäuerung — verbessert die Ausdauer bei kurzen, intensiven Belastungen (1–4 Minuten).', typicalDosage: '3–5 g täglich, aufgeteilt auf mehrere Portionen' },
  { key: 'caffeine', name: 'Koffein', category: 'endurance', description: 'Am besten belegtes Pre-Workout überhaupt — steigert Leistung und senkt das empfundene Anstrengungsniveau.', typicalDosage: '3–6 mg pro kg Körpergewicht, 30–60 Min. vor Belastung' },
  { key: 'citrulline', name: 'Citrullin-Malat', category: 'endurance', description: 'Steigert die NO-Produktion — untersucht für mehr Wiederholungen und weniger Muskelkater.', typicalDosage: '6–8 g etwa 60 Min. vor dem Training' },
  { key: 'arginine', name: 'L-Arginin', category: 'endurance', description: 'NO-Vorstufe. Oral schlechter verfügbar als Citrullin, das dieselbe Wirkung zuverlässiger erreicht.', typicalDosage: '3–6 g vor dem Training' },
  { key: 'beetroot', name: 'Rote-Bete-Extrakt (Nitrat)', category: 'endurance', description: 'Nitrat verbessert die Sauerstoffökonomie — gut belegt für Ausdauerleistung.', typicalDosage: '300–600 mg Nitrat, 2–3 Std. vor Belastung' },
  { key: 'electrolytes', name: 'Elektrolyte', category: 'endurance', description: 'Natrium, Kalium, Magnesium — Ersatz bei langem oder sehr schweißtreibendem Training.', typicalDosage: '1 Portion pro Trainingsstunde bei starkem Schwitzen' },
  { key: 'sodium-bicarbonate', name: 'Natriumbicarbonat', category: 'endurance', description: 'Puffert Säure im Blut bei hochintensiven Belastungen. Magenverträglichkeit vorher testen.', typicalDosage: '0,2–0,3 g pro kg Körpergewicht, 60–120 Min. vorher' },
  { key: 'taurine', name: 'Taurin', category: 'endurance', description: 'Aminosäureähnliche Substanz, untersucht für Ausdauerleistung und Erholung.', typicalDosage: '1–3 g täglich' },
  { key: 'l-carnitine', name: 'L-Carnitin', category: 'endurance', description: 'Rolle im Fettstoffwechsel; als Fatburner überschätzt, für die Erholung nach Belastung besser untersucht.', typicalDosage: '1–2 g täglich zu einer kohlenhydrathaltigen Mahlzeit' },
  { key: 'intra-carbs', name: 'Intra-Workout-Kohlenhydrate', category: 'endurance', description: 'Maltodextrin oder Cluster Dextrin für Belastungen über 90 Minuten.', typicalDosage: '30–60 g pro Stunde bei langer Belastung' },
  { key: 'cordyceps', name: 'Cordyceps', category: 'endurance', description: 'Vitalpilz, traditionell für Ausdauer genutzt. Datenlage dünn, aber gut verträglich.', typicalDosage: '1–3 g Extrakt täglich' },

  // --- Erholung & Schlaf ---
  { key: 'magnesium', name: 'Magnesium', category: 'recovery', description: 'Unterstützt Muskelfunktion, Erholung und Schlaf — bei erhöhtem Training steigt der Bedarf.', typicalDosage: '300–400 mg, oft abends' },
  { key: 'ashwagandha', name: 'Ashwagandha', category: 'recovery', description: 'Adaptogen, das mit Stressreduktion und besserer Erholung in Verbindung gebracht wird.', typicalDosage: '300–600 mg Extrakt täglich' },
  { key: 'melatonin', name: 'Melatonin', category: 'recovery', description: 'Verkürzt die Einschlafzeit und hilft bei verschobenem Rhythmus (Schichtarbeit, Jetlag).', typicalDosage: '0,5–2 mg, 30–60 Min. vor dem Schlafen' },
  { key: 'l-theanine', name: 'L-Theanin', category: 'recovery', description: 'Aminosäure aus grünem Tee — fördert ruhige Wachheit ohne Müdigkeit.', typicalDosage: '100–200 mg bei Bedarf' },
  { key: 'glycine', name: 'Glycin', category: 'recovery', description: 'Aminosäure, untersucht für subjektiv besseren Schlaf und schnelleres Einschlafen.', typicalDosage: '3 g etwa 60 Min. vor dem Schlafen' },
  { key: 'rhodiola', name: 'Rhodiola Rosea', category: 'recovery', description: 'Adaptogen gegen stressbedingte Erschöpfung — eher morgens, kann abends wachhalten.', typicalDosage: '200–400 mg Extrakt morgens' },
  { key: 'tart-cherry', name: 'Sauerkirsch-Extrakt', category: 'recovery', description: 'Untersucht für weniger Muskelkater nach harten Einheiten und besseren Schlaf.', typicalDosage: '480 mg Extrakt oder 30 ml Konzentrat täglich' },
  { key: 'zma', name: 'ZMA', category: 'recovery', description: 'Zink-Magnesium-B6-Kombination, klassisch abends. Wirkt vor allem, wenn ein Mangel besteht.', typicalDosage: '1 Portion abends, nüchtern' },
  { key: 'valerian', name: 'Baldrian', category: 'recovery', description: 'Traditionelles pflanzliches Einschlafmittel, mild und gut verträglich.', typicalDosage: '300–600 mg Extrakt vor dem Schlafen' },
  { key: 'lemon-balm', name: 'Zitronenmelisse', category: 'recovery', description: 'Beruhigend, oft mit Baldrian kombiniert.', typicalDosage: '300–600 mg Extrakt abends' },

  // --- Gelenke & Knochen ---
  { key: 'collagen', name: 'Kollagen', category: 'joints', description: 'Wird mit Gelenk-, Sehnen- und Hautgesundheit in Verbindung gebracht, besonders bei intensivem Training.', typicalDosage: '10–15 g täglich, idealerweise mit Vitamin C' },
  { key: 'collagen-uc2', name: 'Kollagen Typ II (UC-II)', category: 'joints', description: 'Undenaturiertes Kollagen in sehr kleiner Dosis — anderer Wirkmechanismus als Kollagen-Peptide.', typicalDosage: '40 mg täglich' },
  { key: 'glucosamine', name: 'Glucosamin', category: 'joints', description: 'Knorpelbaustein, klassisch bei Gelenkbeschwerden. Wirkung umstritten, Verträglichkeit gut.', typicalDosage: '1500 mg täglich' },
  { key: 'chondroitin', name: 'Chondroitin', category: 'joints', description: 'Meist mit Glucosamin kombiniert, ebenfalls für den Knorpelstoffwechsel.', typicalDosage: '800–1200 mg täglich' },
  { key: 'msm', name: 'MSM', category: 'joints', description: 'Organische Schwefelverbindung, untersucht für Gelenkbeschwerden und Muskelkater.', typicalDosage: '1,5–3 g täglich' },
  { key: 'hyaluronic-acid', name: 'Hyaluronsäure', category: 'joints', description: 'Bestandteil der Gelenkflüssigkeit; oral untersucht für Gelenke und Hautfeuchtigkeit.', typicalDosage: '80–200 mg täglich' },
  { key: 'calcium', name: 'Kalzium', category: 'joints', description: 'Wichtigster Knochenbaustein — relevant vor allem bei wenig Milchprodukten in der Ernährung.', typicalDosage: '500–1000 mg täglich, zu einer Mahlzeit' },
  { key: 'vitamin-k2', name: 'Vitamin K2 (MK-7)', category: 'joints', description: 'Lenkt Kalzium in den Knochen — sinnvolle Ergänzung zu Vitamin D3.', typicalDosage: '100–200 µg täglich zu einer fetthaltigen Mahlzeit' },
  { key: 'boswellia', name: 'Boswellia (Weihrauch)', category: 'joints', description: 'Pflanzlicher Extrakt, untersucht für entzündungsbedingte Gelenkbeschwerden.', typicalDosage: '300–500 mg Extrakt, 2–3× täglich' },
  { key: 'silicon', name: 'Silizium (Kieselerde)', category: 'joints', description: 'Spurenelement für Bindegewebe, Haut, Haare und Nägel.', typicalDosage: '10–40 mg täglich' },

  // --- Immunsystem ---
  { key: 'vitamin-c', name: 'Vitamin C', category: 'immune', description: 'Antioxidans und Immunfaktor; verkürzt Erkältungen leicht, verhindert sie nicht.', typicalDosage: '200–1000 mg täglich' },
  { key: 'vitamin-d3', name: 'Vitamin D3', category: 'immune', description: 'Besonders in den lichtärmeren Monaten oft eine sinnvolle Ergänzung.', typicalDosage: '1000–2000 IE täglich, zu einer fetthaltigen Mahlzeit' },
  { key: 'zinc', name: 'Zink', category: 'immune', description: 'Unterstützt Immunsystem und Hormonhaushalt.', typicalDosage: '15–25 mg täglich' },
  { key: 'selenium', name: 'Selen', category: 'immune', description: 'Spurenelement für Immunsystem und Schilddrüse. Enge Sicherheitsspanne — nicht dauerhaft überdosieren.', typicalDosage: '50–100 µg täglich' },
  { key: 'elderberry', name: 'Holunderbeer-Extrakt', category: 'immune', description: 'Traditionell bei Erkältungen, mit einigen positiven Studien zur Dauer der Symptome.', typicalDosage: '300–600 mg Extrakt täglich in der Erkältungszeit' },
  { key: 'echinacea', name: 'Echinacea (Sonnenhut)', category: 'immune', description: 'Klassisches pflanzliches Immunpräparat, meist kurweise über wenige Wochen.', typicalDosage: '300–500 mg Extrakt, 2–3× täglich' },
  { key: 'beta-glucan', name: 'Beta-Glucan', category: 'immune', description: 'Ballaststoff aus Hefe oder Hafer, untersucht für die Immunabwehr bei hoher Trainingsbelastung.', typicalDosage: '250–500 mg täglich' },
  { key: 'propolis', name: 'Propolis', category: 'immune', description: 'Bienenharz mit antimikrobiellen Eigenschaften. Nicht bei Bienenprodukt-Allergie.', typicalDosage: '500 mg täglich' },
  { key: 'quercetin', name: 'Quercetin', category: 'immune', description: 'Pflanzliches Flavonoid, untersucht für Immunfunktion und Entzündungsgeschehen.', typicalDosage: '500–1000 mg täglich' },

  // --- Fokus & Kognition ---
  { key: 'l-tyrosine', name: 'L-Tyrosin', category: 'cognition', description: 'Vorstufe von Dopamin und Noradrenalin — untersucht für geistige Leistung unter Stress oder Schlafmangel.', typicalDosage: '500–2000 mg, 30–60 Min. vor Bedarf' },
  { key: 'bacopa', name: 'Bacopa Monnieri', category: 'cognition', description: 'Ayurvedisches Kraut mit Daten zum Gedächtnis — wirkt erst nach mehreren Wochen.', typicalDosage: '300 mg Extrakt täglich über mind. 8 Wochen' },
  { key: 'ginkgo', name: 'Ginkgo Biloba', category: 'cognition', description: 'Traditionell für Durchblutung und Gedächtnis, vor allem im höheren Alter untersucht.', typicalDosage: '120–240 mg Extrakt täglich' },
  { key: 'ginseng', name: 'Panax Ginseng', category: 'cognition', description: 'Adaptogen für Energie und geistige Wachheit.', typicalDosage: '200–400 mg Extrakt täglich' },
  { key: 'lions-mane', name: 'Löwenmähne (Hericium)', category: 'cognition', description: 'Vitalpilz, untersucht für Nervenwachstumsfaktoren und kognitive Funktion.', typicalDosage: '500–1000 mg Extrakt täglich' },
  { key: 'alpha-gpc', name: 'Alpha-GPC', category: 'cognition', description: 'Gut verfügbare Cholinquelle für Acetylcholin — Fokus und, in höherer Dosis, Kraftleistung.', typicalDosage: '300–600 mg täglich' },
  { key: 'phosphatidylserine', name: 'Phosphatidylserin', category: 'cognition', description: 'Zellmembran-Baustein, untersucht für Gedächtnis und die Cortisolantwort auf Stress.', typicalDosage: '100–300 mg täglich' },
  { key: 'choline', name: 'Cholin', category: 'cognition', description: 'Essenzieller Nährstoff für Leber und Nervensystem, in der Ernährung oft knapp.', typicalDosage: '250–500 mg täglich' },
  { key: 'caffeine-theanine', name: 'Koffein + L-Theanin', category: 'cognition', description: 'Klassische Kombination: Theanin nimmt dem Koffein die Unruhe, der Fokus bleibt.', typicalDosage: '100 mg Koffein + 200 mg L-Theanin' },

  // --- Darm & Verdauung ---
  { key: 'probiotics', name: 'Probiotika', category: 'gut', description: 'Lebende Kulturen, meist als Mehrstamm-Präparat — nach Antibiotika oder bei Verdauungsbeschwerden.', typicalDosage: '1–10 Mrd. KBE täglich' },
  { key: 'prebiotics', name: 'Präbiotika (Inulin)', category: 'gut', description: 'Ballaststoffe als Futter für die eigene Darmflora. Langsam einschleichen.', typicalDosage: '3–5 g täglich, langsam steigern' },
  { key: 'psyllium', name: 'Flohsamenschalen', category: 'gut', description: 'Quellende Ballaststoffe für die Verdauung — reichlich Wasser dazu trinken.', typicalDosage: '5–10 g täglich mit viel Flüssigkeit' },
  { key: 'digestive-enzymes', name: 'Verdauungsenzyme', category: 'gut', description: 'Protease, Lipase, Amylase — bei Völlegefühl nach großen oder sehr fettreichen Mahlzeiten.', typicalDosage: '1 Kapsel zur Mahlzeit' },
  { key: 'l-glutamine', name: 'L-Glutamin', category: 'gut', description: 'Aminosäure, Hauptenergiequelle der Darmschleimhaut.', typicalDosage: '5 g täglich' },
  { key: 'ginger', name: 'Ingwer-Extrakt', category: 'gut', description: 'Gut belegt gegen Übelkeit, traditionell verdauungsfördernd.', typicalDosage: '500–1000 mg täglich' },
  { key: 'peppermint-oil', name: 'Pfefferminzöl (magensaftresistent)', category: 'gut', description: 'Eines der besser belegten Mittel bei Reizdarmbeschwerden. Nur magensaftresistent sinnvoll.', typicalDosage: '180–225 mg, 2–3× täglich vor dem Essen' },
  { key: 'lactase', name: 'Laktase', category: 'gut', description: 'Enzym für Milchzucker — bei Laktoseintoleranz direkt zur Mahlzeit.', typicalDosage: 'Nach Bedarf zur laktosehaltigen Mahlzeit' },
  { key: 's-boulardii', name: 'Saccharomyces boulardii', category: 'gut', description: 'Probiotische Hefe, besonders für Reisen und die Zeit nach Antibiotika untersucht.', typicalDosage: '250–500 mg täglich' },

  // --- Vitamine & Grundversorgung ---
  { key: 'multivitamin', name: 'Multivitamin', category: 'general_health', description: 'Breite Grundabsicherung bei lückenhafter Mikronährstoffzufuhr.', typicalDosage: '1 Portion täglich zu einer Mahlzeit' },
  { key: 'omega-3', name: 'Omega-3', category: 'general_health', description: 'Deckt EPA/DHA, wenn fetter Fisch selten auf dem Speiseplan steht.', typicalDosage: '1–2 g EPA/DHA täglich, zu einer Mahlzeit' },
  { key: 'algae-oil', name: 'Algenöl', category: 'general_health', description: 'Veganes Omega-3 direkt aus der Quelle, aus der auch Fische es beziehen.', typicalDosage: '1–2 g EPA/DHA täglich' },
  { key: 'vitamin-b12', name: 'Vitamin B12', category: 'general_health', description: 'Bei veganer oder stark fleischarmer Ernährung praktisch immer notwendig.', typicalDosage: '250 µg täglich oder 1000 µg mehrmals pro Woche' },
  { key: 'vitamin-b-complex', name: 'Vitamin-B-Komplex', category: 'general_health', description: 'Alle B-Vitamine gemeinsam — für Energiestoffwechsel und Nervensystem.', typicalDosage: '1 Kapsel täglich morgens' },
  { key: 'folate', name: 'Folsäure', category: 'general_health', description: 'Wichtig für Zellteilung und Blutbildung, besonders bei Kinderwunsch und in der Schwangerschaft.', typicalDosage: '400 µg täglich' },
  { key: 'vitamin-e', name: 'Vitamin E', category: 'general_health', description: 'Fettlösliches Antioxidans zum Schutz der Zellmembranen.', typicalDosage: '12–15 mg täglich zu einer fetthaltigen Mahlzeit' },
  { key: 'vitamin-a', name: 'Vitamin A', category: 'general_health', description: 'Für Sehkraft, Haut und Schleimhäute. In der Schwangerschaft nicht hochdosiert.', typicalDosage: '800–1000 µg täglich' },
  { key: 'iron', name: 'Eisen', category: 'general_health', description: 'Nur bei nachgewiesenem Mangel ergänzen — vorher Blutwerte prüfen lassen.', typicalDosage: '14–20 mg täglich, nüchtern mit Vitamin C' },
  { key: 'iodine', name: 'Jod', category: 'general_health', description: 'Für die Schilddrüse. Bei Schilddrüsenerkrankungen vorher ärztlich abklären.', typicalDosage: '100–200 µg täglich' },
  { key: 'potassium', name: 'Kalium', category: 'general_health', description: 'Für Blutdruck und Muskelfunktion; in gemüsearmer Ernährung oft knapp.', typicalDosage: '200–500 mg täglich ergänzend' },
  { key: 'curcumin', name: 'Kurkuma (Curcumin)', category: 'general_health', description: 'Entzündungsmodulierend. Allein sehr schlecht verfügbar — auf Piperin oder eine Spezialformulierung achten.', typicalDosage: '500–1000 mg Curcumin täglich mit Piperin' },
  { key: 'coq10', name: 'Coenzym Q10', category: 'general_health', description: 'Für die Energiegewinnung in den Mitochondrien; körpereigene Produktion sinkt mit dem Alter.', typicalDosage: '100–200 mg täglich zu einer fetthaltigen Mahlzeit' },
  { key: 'alpha-lipoic-acid', name: 'Alpha-Liponsäure', category: 'general_health', description: 'Antioxidans, untersucht für Blutzuckerregulation und Nervengesundheit.', typicalDosage: '300–600 mg täglich' },
  { key: 'resveratrol', name: 'Resveratrol', category: 'general_health', description: 'Polyphenol aus Trauben, untersucht für Gefäßgesundheit und Zellalterung.', typicalDosage: '150–500 mg täglich' },
  { key: 'astaxanthin', name: 'Astaxanthin', category: 'general_health', description: 'Sehr starkes Carotinoid-Antioxidans aus Mikroalgen, u.a. für Haut und Augen.', typicalDosage: '4–12 mg täglich zu einer fetthaltigen Mahlzeit' },
  { key: 'milk-thistle', name: 'Mariendistel', category: 'general_health', description: 'Traditionell für die Leber, Wirkstoff Silymarin.', typicalDosage: '200–400 mg Silymarin täglich' },
  { key: 'green-tea-extract', name: 'Grüntee-Extrakt (EGCG)', category: 'general_health', description: 'Antioxidativ und leicht stoffwechselaktivierend. Hochdosiert nicht auf leeren Magen.', typicalDosage: '300–500 mg EGCG täglich' },
  { key: 'spirulina', name: 'Spirulina', category: 'general_health', description: 'Mikroalge mit hohem Protein- und Mikronährstoffgehalt.', typicalDosage: '3–5 g täglich' },
  { key: 'chlorella', name: 'Chlorella', category: 'general_health', description: 'Süßwasseralge, reich an Chlorophyll, Eisen und B-Vitaminen.', typicalDosage: '3–5 g täglich' },
  { key: 'opc', name: 'Traubenkernextrakt (OPC)', category: 'general_health', description: 'Polyphenole für Gefäße und Bindegewebe.', typicalDosage: '150–300 mg täglich' },
]

/**
 * Which seed entries this device has already been offered.
 *
 * Kept as its own marker rather than derived from the table, so that deleting
 * a seeded entry sticks: "is it in the catalog" can't tell "never added" from
 * "added and thrown away", and re-adding the latter on every launch would
 * make deletion impossible. localStorage rather than Dexie because the
 * catalog is device-local anyway — sync covers meals, recipes, the body
 * profile and the API key, not supplements.
 */
const APPLIED_KEYS_STORAGE = 'kcal-tracker:supplement-seed-keys'

function loadAppliedKeys(): Set<string> {
  try {
    const raw = window.localStorage.getItem(APPLIED_KEYS_STORAGE)
    const parsed = raw ? JSON.parse(raw) : null
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveAppliedKeys(keys: Set<string>): void {
  try {
    window.localStorage.setItem(APPLIED_KEYS_STORAGE, JSON.stringify([...keys]))
  } catch {
    // Private mode or a full quota: the worst case is re-offering entries the
    // user already deleted, which is annoying but not broken.
  }
}

/**
 * `?? ''` because the argument comes from an IndexedDB row, where the declared
 * type is a description of what we write, not a guarantee of what we read: a
 * catalog row without a `name` (an interrupted sync, a half-written AI
 * suggestion, an older schema) threw here. And because this runs from
 * main.tsx as fire-and-forget, the throw was invisible — syncSupplementCatalog
 * simply stopped, at every single launch, so the seed catalog silently never
 * updated again for anyone holding one bad row.
 */
function normalizeName(name: string | undefined): string {
  return (name ?? '').trim().toLowerCase()
}

/**
 * Brings the catalog up to date with the seed list above, on every launch.
 *
 * Replaces the earlier "seed once, only into an empty table" approach, which
 * had the quiet flaw that anyone who had already used the app could never
 * receive a later catalog entry — the table was never empty again, so growing
 * the seed from 10 entries to ~90 would have shipped to new installs only.
 *
 * Three rules, in order:
 * - A seed entry whose key was already applied is skipped, even if it's now
 *   missing from the table. That's how deleting a seeded entry stays deleted.
 * - A seed entry whose *name* already exists is adopted rather than added
 *   again — this is what keeps the ten originals (seeded before keys existed)
 *   from reappearing as duplicates.
 * - Adopted and previously seeded entries get their category, description and
 *   dosage refreshed from the seed. Safe because catalog rows aren't
 *   user-editable: the form edits the personal MySupplement entry (dosage,
 *   times of day), never the catalog row behind it. Custom entries are never
 *   touched.
 */
export async function syncSupplementCatalog(): Promise<void> {
  const applied = loadAppliedKeys()
  const existing = await db.supplements.toArray()
  const byName = new Map(existing.map((s) => [normalizeName(s.name), s]))

  const toAdd: Supplement[] = []
  const toUpdate: Supplement[] = []
  const now = Date.now()

  for (const seed of SEED) {
    const match = byName.get(normalizeName(seed.name))

    if (match) {
      if (match.isCustom) continue
      if (
        match.category !== seed.category ||
        match.description !== seed.description ||
        match.typicalDosage !== seed.typicalDosage
      ) {
        toUpdate.push({
          ...match,
          category: seed.category,
          description: seed.description,
          typicalDosage: seed.typicalDosage,
        })
      }
      applied.add(seed.key)
      continue
    }

    if (applied.has(seed.key)) continue

    toAdd.push({
      id: newSupplementId(),
      name: seed.name,
      category: seed.category,
      description: seed.description,
      typicalDosage: seed.typicalDosage,
      isCustom: false,
      createdAt: now,
    })
    applied.add(seed.key)
  }

  if (toAdd.length > 0) await db.supplements.bulkAdd(toAdd)
  if (toUpdate.length > 0) await db.supplements.bulkPut(toUpdate)
  saveAppliedKeys(applied)
}
