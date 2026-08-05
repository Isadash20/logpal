import type { Settings } from '../types'

/** Canonical storage units: weight in lb, length in inches, volume in ml. */

export const LB_PER_KG = 2.2046226218
export const IN_PER_CM = 0.3937007874
export const ML_PER_CUP = 236.588
export const ML_PER_FLOZ = 29.5735

export function lbToDisplay(lb: number, unit: Settings['weightUnit']): number {
  return unit === 'kg' ? lb / LB_PER_KG : lb
}

export function displayToLb(v: number, unit: Settings['weightUnit']): number {
  return unit === 'kg' ? v * LB_PER_KG : v
}

export function inToDisplay(inches: number, unit: Settings['heightUnit']): number {
  return unit === 'cm' ? inches / IN_PER_CM : inches
}

export function displayToIn(v: number, unit: Settings['heightUnit']): number {
  return unit === 'cm' ? v * IN_PER_CM : v
}

export function mlToDisplay(ml: number, unit: Settings['waterUnit']): number {
  if (unit === 'cup') return ml / ML_PER_CUP
  if (unit === 'floz') return ml / ML_PER_FLOZ
  return ml
}

export function displayToMl(v: number, unit: Settings['waterUnit']): number {
  if (unit === 'cup') return v * ML_PER_CUP
  if (unit === 'floz') return v * ML_PER_FLOZ
  return v
}

export function waterUnitLabel(unit: Settings['waterUnit'], n = 2): string {
  if (unit === 'cup') return n === 1 ? 'cup' : 'cups'
  if (unit === 'floz') return 'fl oz'
  return 'ml'
}

export function energyToDisplay(kcal: number, unit: Settings['energyUnit']) {
  return unit === 'kJ' ? kcal * 4.184 : kcal
}

export function energyLabel(unit: Settings['energyUnit']) {
  return unit === 'kJ' ? 'kJ' : 'cal'
}

/** 70 inches → { feet: 5, inches: 10 } */
export function splitFeetInches(totalIn: number) {
  const feet = Math.floor(totalIn / 12)
  const inches = Math.round(totalIn - feet * 12)
  return inches === 12 ? { feet: feet + 1, inches: 0 } : { feet, inches }
}

export function formatHeight(totalIn: number, unit: Settings['heightUnit']) {
  if (unit === 'cm') return `${Math.round(totalIn / IN_PER_CM)} cm`
  const { feet, inches } = splitFeetInches(totalIn)
  return `${feet}' ${inches}"`
}
