import { z } from 'zod'
import type { CombatState, TrackedCombatant } from './combat'
import { parseDice, rollDice } from './dice'
import type { Rules } from './rules'
import type { Rng } from './rng'

export const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const

export type DamageType = (typeof DAMAGE_TYPES)[number]

const advantageSchema = z.enum(['normal', 'advantage', 'disadvantage'])
type Advantage = z.infer<typeof advantageSchema>

const diceNotation = z.string().refine(
  (value) => {
    try {
      parseDice(value)
      return true
    } catch {
      return false
    }
  },
  { message: 'Ongeldige dobbelsteennotatie' },
)

export const attackInputSchema = z
  .object({
    attackerId: z.string().min(1),
    attackBonus: z.number().int(),
    targetAc: z.number().int(),
    damage: diceNotation,
    damageType: z.enum(DAMAGE_TYPES),
    advantage: advantageSchema.default('normal'),
  })
  .strict()

export const saveInputSchema = z
  .object({
    creatureId: z.string().min(1),
    bonus: z.number().int(),
    dc: z.number().int(),
    advantage: advantageSchema.default('normal'),
  })
  .strict()

export type AttackInput = z.input<typeof attackInputSchema>
export type SaveInput = z.input<typeof saveInputSchema>

export type AttackResult = {
  attackerId: string
  rolls: number[]
  d20: number
  bonus: number
  total: number
  targetAc: number
  outcome: 'miss' | 'hit' | 'crit'
  damage?: { total: number; type: DamageType; rolls: number[] }
}

export type SaveResult = {
  creatureId: string
  rolls: number[]
  d20: number
  bonus: number
  total: number
  dc: number
  success: boolean
}

function rollD20(rng: Rng, advantage: Advantage): { rolls: number[]; d20: number } {
  const count = advantage === 'normal' ? 1 : 2
  const rolls = Array.from({ length: count }, () => Math.floor(rng() * 20) + 1)
  const d20 =
    advantage === 'advantage'
      ? Math.max(...rolls)
      : advantage === 'disadvantage'
        ? Math.min(...rolls)
        : rolls[0]
  return { rolls, d20 }
}

/** Zoekt een vijand of NPC die kan handelen. De speler rolt zelf en komt hier nooit in. */
function findActor(state: CombatState, id: string): TrackedCombatant {
  const found = state.combatants.find((c) => c.id === id)
  if (!found) throw new Error(`Onbekend wezen "${id}"`)
  if (found.kind === 'player') {
    throw new Error(`"${id}" is de speler; de speler rolt zijn eigen dobbelstenen`)
  }
  return found
}

/** Aanval van een vijand of NPC: d20, treffer en schade. De state blijft ongewijzigd. */
export function executeAttack(
  state: CombatState,
  input: unknown,
  rng: Rng,
  rules: Rules,
): AttackResult {
  const parsed = attackInputSchema.parse(input)
  const attacker = findActor(state, parsed.attackerId)
  if (attacker.hp.current <= 0) throw new Error(`"${attacker.id}" is uitgeschakeld`)

  const { rolls, d20 } = rollD20(rng, parsed.advantage)
  const total = d20 + parsed.attackBonus
  const base = {
    attackerId: attacker.id,
    rolls,
    d20,
    bonus: parsed.attackBonus,
    total,
    targetAc: parsed.targetAc,
  }

  const crit = d20 === 20
  const hit = crit || (d20 !== 1 && total >= parsed.targetAc)
  if (!hit) return { ...base, outcome: 'miss' }

  const damage = crit
    ? rules.critDamage(parseDice(parsed.damage), rng)
    : rollDice(parsed.damage, rng)
  return {
    ...base,
    outcome: crit ? 'crit' : 'hit',
    damage: { total: Math.max(0, damage.total), type: parsed.damageType, rolls: damage.rolls },
  }
}

/** Reddingsworp van een vijand of NPC. De state blijft ongewijzigd. */
export function executeSave(
  state: CombatState,
  input: unknown,
  rng: Rng,
  rules: Rules,
): SaveResult {
  const parsed = saveInputSchema.parse(input)
  const creature = findActor(state, parsed.creatureId)

  const { rolls, d20 } = rollD20(rng, parsed.advantage)
  const total = d20 + parsed.bonus
  const success = !(rules.natOneSaveFails && d20 === 1) && total >= parsed.dc
  return {
    creatureId: creature.id,
    rolls,
    d20,
    bonus: parsed.bonus,
    total,
    dc: parsed.dc,
    success,
  }
}
