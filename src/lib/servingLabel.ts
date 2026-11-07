import type { Serving } from "../types";

/**
 * What the serving picker calls each portion.
 *
 * The first portion of every food is its serving: the label's declared
 * serving for packaged food, the first household measure for USDA, what the
 * user typed for a custom food. Nobody has those memorised, so the picker
 * names it "1 serving" and shows what that is beside it, e.g. "1 serving ·
 * 30 g" or "1 serving · 1 cup". A label that already says "serving" is
 * left alone. The stored entry keeps the raw label, so nothing logged
 * changes.
 */
export function servingChoice(s: Serving, index: number): string {
  if (index !== 0) return s.label;
  if (/serving/i.test(s.label)) return s.label;
  return `1 serving · ${s.label}`;
}
