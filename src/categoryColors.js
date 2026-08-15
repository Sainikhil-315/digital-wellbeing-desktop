// Single source of truth for category → color across the whole UI.
// Keys must match the category strings returned by electron/classifier.js.
export const CATEGORY_COLORS = {
  browser:       '#4B8FE2',
  development:   '#5C9E2E',
  communication: '#2AADAD',
  productivity:  '#6366F1',
  entertainment: '#D4821A',
  gaming:        '#E24B4A',
  social:        '#BF5CBF',
  utility:       '#8884A0',
  other:         '#48455A',
}

export function catColor(category) {
  if (!category) return CATEGORY_COLORS.other
  return CATEGORY_COLORS[category.toLowerCase()] || CATEGORY_COLORS.other
}
