// Combat-state voor vijanden en NPC's. Pure, onveranderlijke functies zonder I/O.
// De speler beheert zijn eigen HP en resources; de engine volgt alleen zijn plek in de volgorde.

// Exhaustion ontbreekt bewust: het kent niveaus en past niet in een lijst van aan/uit-condities.
export const CONDITIONS = [
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const

export type Condition = (typeof CONDITIONS)[number]

export type Hp = { current: number; max: number }

type CombatantBase = {
  id: string
  name: string
  initiative: number
  dexMod: number
}

export type PlayerCombatant = CombatantBase & { kind: 'player' }

export type TrackedCombatant = CombatantBase & {
  kind: 'enemy' | 'npc'
  ac: number
  hp: Hp
  conditions: Condition[]
}

export type Combatant = PlayerCombatant | TrackedCombatant

export type CombatState = {
  combatants: Combatant[]
  round: number
  turnId: string | null
}

export function createCombat(): CombatState {
  return { combatants: [], round: 1, turnId: null }
}

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`Ongeldige waarde voor ${label}: ${value}`)
}

export function addCombatant(state: CombatState, combatant: Combatant): CombatState {
  if (state.combatants.some((c) => c.id === combatant.id)) {
    throw new Error(`Deelnemer met id "${combatant.id}" bestaat al`)
  }
  assertFinite(combatant.initiative, 'initiative')
  assertFinite(combatant.dexMod, 'dexterity-modifier')
  if (combatant.kind !== 'player') {
    assertFinite(combatant.ac, 'AC')
    const { current, max } = combatant.hp
    assertFinite(current, 'huidige HP')
    assertFinite(max, 'maximale HP')
    if (current < 0 || max < 0) {
      throw new Error(`HP mag niet negatief zijn (${current}/${max})`)
    }
    if (current > max) {
      throw new Error(`Huidige HP (${current}) is hoger dan de maximale HP (${max})`)
    }
  }
  // Kopie, zodat muteren door de aanroeper de state niet raakt.
  const copy: Combatant =
    combatant.kind === 'player'
      ? { ...combatant }
      : { ...combatant, hp: { ...combatant.hp }, conditions: [...combatant.conditions] }
  return { ...state, combatants: [...state.combatants, copy] }
}

export function rollInitiative(dexMod: number, rng: () => number): number {
  return Math.floor(rng() * 20) + 1 + dexMod
}

// Hoogste initiative eerst, dan hoogste dexterity-modifier, dan volgorde van toevoegen.
export function initiativeOrder(state: CombatState): Combatant[] {
  return state.combatants
    .map((combatant, index) => ({ combatant, index }))
    .sort(
      (a, b) =>
        b.combatant.initiative - a.combatant.initiative ||
        b.combatant.dexMod - a.combatant.dexMod ||
        a.index - b.index,
    )
    .map(({ combatant }) => combatant)
}

export function isDown(combatant: Combatant): boolean {
  return combatant.kind !== 'player' && combatant.hp.current <= 0
}

function updateTracked(
  state: CombatState,
  id: string,
  update: (combatant: TrackedCombatant) => TrackedCombatant,
): CombatState {
  const target = state.combatants.find((c) => c.id === id)
  if (!target) throw new Error(`Onbekende deelnemer "${id}"`)
  if (target.kind === 'player') {
    throw new Error(`"${id}" is de speler; de speler beheert zijn eigen HP en condities`)
  }
  return {
    ...state,
    combatants: state.combatants.map((c) => (c.id === id ? update(target) : c)),
  }
}

function assertAmount(amount: number) {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`Ongeldig bedrag: ${amount}`)
  }
}

export function applyDamage(state: CombatState, id: string, amount: number): CombatState {
  assertAmount(amount)
  return updateTracked(state, id, (c) => ({
    ...c,
    hp: { ...c.hp, current: Math.max(0, c.hp.current - amount) },
  }))
}

export function heal(state: CombatState, id: string, amount: number): CombatState {
  assertAmount(amount)
  return updateTracked(state, id, (c) => ({
    ...c,
    hp: { ...c.hp, current: Math.min(c.hp.max, c.hp.current + amount) },
  }))
}

export function addCondition(state: CombatState, id: string, condition: Condition): CombatState {
  return updateTracked(state, id, (c) =>
    c.conditions.includes(condition) ? c : { ...c, conditions: [...c.conditions, condition] },
  )
}

export function removeCondition(state: CombatState, id: string, condition: Condition): CombatState {
  return updateTracked(state, id, (c) => ({
    ...c,
    conditions: c.conditions.filter((x) => x !== condition),
  }))
}

export function startCombat(state: CombatState): CombatState {
  if (state.turnId !== null) throw new Error('Het gevecht is al gestart')
  if (state.combatants.length === 0) throw new Error('Een gevecht heeft deelnemers nodig')
  const first = initiativeOrder(state).find((c) => !isDown(c))
  if (!first) throw new Error('Niemand kan handelen')
  return { ...state, round: 1, turnId: first.id }
}

export function currentCombatant(state: CombatState): Combatant | undefined {
  return state.combatants.find((c) => c.id === state.turnId)
}

export function nextTurn(state: CombatState): CombatState {
  if (state.turnId === null) throw new Error('Het gevecht is nog niet gestart')
  const order = initiativeOrder(state)
  const start = order.findIndex((c) => c.id === state.turnId)
  for (let step = 1; step <= order.length; step++) {
    const candidate = order[(start + step) % order.length]
    if (!isDown(candidate)) {
      const wrapped = start + step >= order.length
      return { ...state, turnId: candidate.id, round: wrapped ? state.round + 1 : state.round }
    }
  }
  throw new Error('Niemand kan handelen')
}
