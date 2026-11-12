import type { Rng } from './rng'

export type DiceSpec = {
  count: number
  sides: number
  modifier: number
}

export type DiceResult = DiceSpec & {
  rolls: number[]
  total: number
}

const MAX_DICE = 100
const MAX_SIDES = 1000
const MAX_MODIFIER = 1000
const NOTATION = /^(\d*)d(\d+)(?:\s*([+-])\s*(\d+))?$/

/** Leest dobbelsteennotatie zoals 2d6+3, d20 of 1d8-1. */
export function parseDice(notation: string): DiceSpec {
  const match = NOTATION.exec(notation.trim().toLowerCase())
  if (!match) {
    throw new Error(`Ongeldige dobbelsteennotatie: "${notation}"`)
  }
  const count = match[1] === '' ? 1 : Number(match[1])
  const sides = Number(match[2])
  const modifier = match[3] === undefined ? 0 : Number(match[3] + match[4])

  if (count < 1 || count > MAX_DICE) {
    throw new Error(`Het aantal dobbelstenen moet tussen 1 en ${MAX_DICE} liggen: "${notation}"`)
  }
  if (sides < 2) {
    throw new Error(`Een dobbelsteen heeft minstens 2 zijden: "${notation}"`)
  }
  if (sides > MAX_SIDES) {
    throw new Error(`Een dobbelsteen heeft maximaal ${MAX_SIDES} zijden: "${notation}"`)
  }
  if (Math.abs(modifier) > MAX_MODIFIER) {
    throw new Error(`De modifier mag niet groter zijn dan ${MAX_MODIFIER}: "${notation}"`)
  }
  return { count, sides, modifier }
}

/** Rolt de dobbelstenen uit de notatie met de opgegeven rng. */
export function rollDice(notation: string, rng: Rng): DiceResult {
  const spec = parseDice(notation)
  const rolls = Array.from({ length: spec.count }, () => Math.floor(rng() * spec.sides) + 1)
  const total = rolls.reduce((sum, roll) => sum + roll, 0) + spec.modifier
  return { ...spec, rolls, total }
}
