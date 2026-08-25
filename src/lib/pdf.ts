import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Meal } from './db'
import { formatPeriodLabel, type Period } from './stats'

function formatGermanDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-')
  return `${d}.${m}.${y}`
}

/**
 * Exports a rudimentary "nutrition diary" PDF: one row per day that has at
 * least one logged meal within the given range, with daily totals only (no
 * per-meal breakdown). Days without entries are skipped rather than shown as
 * zero rows.
 */
export function exportDiaryPdf(params: {
  period: Period
  anchorKey: string
  /** Only `date` and `nutrition` are read, so the caller can pass photo-free summaries. */
  meals: Pick<Meal, 'date' | 'nutrition'>[]
  startKey: string
  endKey: string
}) {
  const { period, anchorKey, meals, startKey, endKey } = params

  const byDate = new Map<string, { kcal: number; protein: number; carbs: number; fat: number }>()
  for (const m of meals) {
    const cur = byDate.get(m.date) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    cur.kcal += m.nutrition.kcal
    cur.protein += m.nutrition.protein
    cur.carbs += m.nutrition.carbs
    cur.fat += m.nutrition.fat
    byDate.set(m.date, cur)
  }

  const sortedDates = [...byDate.keys()].sort()
  const totalKcal = sortedDates.reduce((sum, d) => sum + byDate.get(d)!.kcal, 0)
  const avgKcal = sortedDates.length ? totalKcal / sortedDates.length : 0

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(29, 29, 31)
  doc.text('Ernährungstagebuch', 40, 50)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(110, 110, 115)
  doc.text(formatPeriodLabel(period, anchorKey), 40, 70)
  doc.text(`Erstellt am ${new Date().toLocaleDateString('de-DE')}`, 40, 86)

  const dayLabel = sortedDates.length === 1 ? 'erfasster Tag' : 'erfasste Tage'
  doc.setFontSize(11)
  doc.setTextColor(29, 29, 31)
  doc.text(
    `Gesamt: ${Math.round(totalKcal).toLocaleString('de-DE')} kcal   ·   Ø pro Tag: ${Math.round(avgKcal).toLocaleString('de-DE')} kcal   ·   ${sortedDates.length} ${dayLabel}`,
    40,
    108,
  )

  autoTable(doc, {
    startY: 128,
    head: [['Datum', 'Kalorien (kcal)', 'Protein (g)', 'Carbs (g)', 'Fett (g)']],
    body: sortedDates.map((date) => {
      const n = byDate.get(date)!
      return [
        formatGermanDate(date),
        Math.round(n.kcal).toString(),
        Math.round(n.protein).toString(),
        Math.round(n.carbs).toString(),
        Math.round(n.fat).toString(),
      ]
    }),
    styles: { font: 'helvetica', fontSize: 10, textColor: [29, 29, 31], cellPadding: 8 },
    headStyles: { fillColor: [255, 149, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 247, 250] },
    margin: { left: 40, right: 40 },
  })

  if (sortedDates.length === 0) {
    doc.setFontSize(11)
    doc.setTextColor(110, 110, 115)
    doc.text('Keine Einträge in diesem Zeitraum.', 40, 150)
  }

  doc.save(`ernaehrungstagebuch-${startKey}_bis_${endKey}.pdf`)
}
