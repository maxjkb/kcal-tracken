/**
 * Rebrand (v2.0.0): full-viewport backdrop behind every screen, mounted once
 * so Liquid Glass surfaces always have something to blur/refract regardless
 * of scroll position. Used to be three large, heavily blurred colour circles
 * (area-tinted via the now-retired --color-section, plus a fixed
 * --color-kcal one) — explicit feedback named that "Farbverlauf" directly as
 * part of why the app still read as the old one. All actual drawing now
 * lives in index.css's .ambient-bg: a faint neutral dot grid over the plain
 * canvas, matching design-demo/vision-board-big-number.html's own body
 * background exactly. This component is just the mount point.
 */
export function AmbientBackground() {
  return <div aria-hidden="true" className="ambient-bg fixed inset-0 -z-30" />
}
