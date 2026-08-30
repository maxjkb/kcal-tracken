import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Eine bewegliche Lichtquelle für den Glas-Baukasten.
 *
 * Zwei Eingaben, dieselbe Ausgabe:
 *  - Zeiger/Finger  — das Licht steht dort, wo der Finger ist. In der Mitte
 *                     senkrecht von oben, zum Rand hin immer flacher.
 *  - Gerätneigung   — dasselbe, nur dass die Neigung des Telefons bestimmt,
 *                     wo die Lampe steht: als läge das Glas unter einer
 *                     festen Deckenleuchte und man kippt es darunter.
 *
 * Bewusst OHNE React-State pro Frame: der Wert landet in einem Ref (für die
 * WebGL-Stufe, die ihn ohnehin jeden Frame liest) und zusätzlich als CSS-
 * Custom-Properties direkt am Container (für die CSS- und SVG-Stufe). Ein
 * setState bei jeder Mausbewegung würde den ganzen Baum neu rendern, um eine
 * rein dekorative Zahl zu transportieren.
 *
 * Die Glättung ist kritisch gedämpft (exponentiell, kein Überschwingen) —
 * ein Glanzlicht, das nachfedert, sieht sofort nach Gummi statt nach Glas aus.
 */

export interface LightState {
  azimuth: number
  elevation: number
  /** Als Einheitsvektor, weil genau das die Shader/Formeln brauchen. */
  x: number
  y: number
  z: number
}

export type GyroState = 'unsupported' | 'idle' | 'granted' | 'denied'

/** Zeitkonstante der Glättung in Sekunden. Klein genug, um direkt zu wirken, groß genug, um Zittern zu schlucken. */
const TAU = 0.085

/** Höhenwinkel in der Mitte (senkrecht von oben) und ganz außen (flach von der Seite). */
const ELEVATION_CENTER = Math.PI / 2
const ELEVATION_EDGE = 0.32

interface Aim {
  azimuth: number
  elevation: number
}

/** Normierter Versatz (−1..1) → Lichtrichtung. Der gemeinsame Nenner von Zeiger und Gyroskop. */
function aimFromOffset(nx: number, ny: number): Aim {
  const dist = Math.min(1, Math.hypot(nx, ny))
  return {
    // −ny, weil die Bildschirm-Y-Achse nach unten zeigt, die Weltachse nach oben.
    azimuth: Math.atan2(-ny, nx),
    elevation: ELEVATION_CENTER + (ELEVATION_EDGE - ELEVATION_CENTER) * dist,
  }
}

/** Kürzester Weg zwischen zwei Winkeln — sonst dreht das Licht bei ±π einmal komplett um die Achse. */
function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export function useLightSource(initial: Aim = { azimuth: 2.36, elevation: 0.95 }) {
  const elRef = useRef<HTMLElement | null>(null)
  const targetRef = useRef<Aim>({ ...initial })
  const lightRef = useRef<LightState>({ ...initial, x: 0, y: 0, z: 1 })
  const gyroActiveRef = useRef(false)
  const [gyro, setGyro] = useState<GyroState>('idle')

  // --- Die Animationsschleife: glättet und schreibt, sonst nichts ---------
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const current = { ...initial }

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      // Exponentielle Annäherung = kritisch gedämpft, kein Überschwingen.
      const k = 1 - Math.exp(-dt / TAU)
      current.azimuth += shortestAngle(current.azimuth, targetRef.current.azimuth) * k
      current.elevation += (targetRef.current.elevation - current.elevation) * k

      const ce = Math.cos(current.elevation)
      const x = Math.cos(current.azimuth) * ce
      const y = Math.sin(current.azimuth) * ce
      const z = Math.sin(current.elevation)
      lightRef.current = { azimuth: current.azimuth, elevation: current.elevation, x, y, z }

      const el = elRef.current
      if (el) {
        // Die CSS- und SVG-Stufe lesen genau diese fünf Variablen.
        el.style.setProperty('--lx', x.toFixed(4))
        el.style.setProperty('--ly', y.toFixed(4))
        el.style.setProperty('--lz', z.toFixed(4))
        // Zusätzlich als Prozentwerte, weil sich damit in CSS ohne
        // calc()-Klimmzüge eine Position ansteuern lässt.
        el.style.setProperty('--lpx', `${(50 + x * 42).toFixed(2)}%`)
        el.style.setProperty('--lpy', `${(50 - y * 42).toFixed(2)}%`)
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // initial absichtlich nicht als Abhängigkeit: es ist ein Startwert, kein
    // gesteuerter Wert — ein neues Objektliteral vom Aufrufer würde die
    // Schleife sonst bei jedem Render neu aufsetzen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Zeigereingabe ------------------------------------------------------
  const setContainer = useCallback((el: HTMLElement | null) => {
    elRef.current = el
  }, [])

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (gyroActiveRef.current) return // Neigung hat Vorrang, sobald sie läuft
      const el = elRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1
      targetRef.current = aimFromOffset(nx, ny)
    }
    window.addEventListener('pointermove', onPointer, { passive: true })
    return () => window.removeEventListener('pointermove', onPointer)
  }, [])

  // --- Gerätneigung -------------------------------------------------------
  useEffect(() => {
    if (typeof DeviceOrientationEvent === 'undefined') setGyro('unsupported')
  }, [])

  const enableGyro = useCallback(async () => {
    if (typeof DeviceOrientationEvent === 'undefined') {
      setGyro('unsupported')
      return
    }
    // iOS verlangt seit 13 eine ausdrückliche Freigabe, und zwar aus einer
    // echten Nutzergeste heraus — deshalb hängt das hier an einem Button und
    // läuft nicht beim Laden der Seite los.
    const req = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<PermissionState> })
      .requestPermission
    if (typeof req === 'function') {
      try {
        const res = await req()
        if (res !== 'granted') {
          setGyro('denied')
          return
        }
      } catch {
        setGyro('denied')
        return
      }
    }

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta === null && e.gamma === null) return
      gyroActiveRef.current = true
      // gamma = Kippen nach links/rechts (−90..90)
      // beta  = Kippen nach vorn/hinten (−180..180); ~45° entspricht der
      //         normalen Lesehaltung, deshalb ist das hier die Null.
      const nx = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 40))
      const ny = Math.max(-1, Math.min(1, ((e.beta ?? 45) - 45) / 40))
      targetRef.current = aimFromOffset(nx, ny)
    }
    window.addEventListener('deviceorientation', onOrient)
    setGyro('granted')
  }, [])

  return { setContainer, lightRef, gyro, enableGyro }
}
