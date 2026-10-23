import { Icon } from './Icon'
import { FOOD_KIND_COLOR, FOOD_KIND_ICON, foodKind } from '../lib/foodIcon'

/**
 * The small picture beside a food: its group's mark on its group's tint.
 *
 * Decided from the name (see lib/foodIcon.ts). Deliberately a flat tint and a
 * stroke mark rather than an emoji or a photo, so forty of them in a list read
 * as one calm system rather than a sticker sheet.
 */
export function FoodMark({
  name,
  brand,
  size = 36,
  round,
}: {
  name: string
  brand?: string
  size?: number
  round?: boolean
}) {
  const kind = foodKind(name, brand)
  const color = FOOD_KIND_COLOR[kind]
  return (
    <span
      className={`foodmark ${round ? 'foodmark--round' : ''}`}
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 14%, var(--surface))`,
        color,
      }}
      aria-hidden="true"
    >
      <Icon name={FOOD_KIND_ICON[kind]} size={Math.round(size * 0.52)} strokeWidth={2} />
    </span>
  )
}
