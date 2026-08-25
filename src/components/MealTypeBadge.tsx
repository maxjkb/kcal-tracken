import type { MealType } from '../lib/db'
import { MealTypeIcon } from './MealTypeIcon'
import { MEAL_TYPE_COLOR } from '../lib/mealTypeColor'

/**
 * The meal-type pictogram in its own tinted badge.
 *
 * One component rather than the same three lines repeated at five call sites:
 * the badge, its tint and its icon are one idea, and they were already drifting
 * apart (six, nine and twelve pixel boxes with three different corner radii for
 * what is visibly the same element).
 *
 * `color-mix` for the background so the tint is derived from the one colour
 * rather than maintained as a second, separately-defined pale variant per meal
 * type — eight values to keep in step where four will do.
 */
export function MealTypeBadge({
  type,
  size = 'md',
  className = '',
}: {
  type: MealType
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const box = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-12 w-12' : 'h-9 w-9'
  const icon = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-[1.15rem] w-[1.15rem]'
  const color = MEAL_TYPE_COLOR[type]

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ${box} ${className}`}
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
    >
      <MealTypeIcon type={type} className={icon} />
    </span>
  )
}
