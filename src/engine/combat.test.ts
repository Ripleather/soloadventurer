import { describe, expect, it } from 'vitest'
import {
  addCombatant,
  addCondition,
  applyDamage,
  createCombat,
  currentCombatant,
  heal,
  initiativeOrder,
  isDown,
  nextTurn,
  removeCondition,
  rollInitiative,
  startCombat,
  type Combatant,
  type CombatState,
} from './combat'

function enemy(id: string, initiative: number, overrides: Partial<Combatant> = {}): Combatant {
  return {
    kind: 'enemy',
    id,
    name: id,
    initiative,
    dexMod: 0,
    ac: 13,
    hp: { current: 20, max: 20 },
    conditions: [],
    ...overrides,
  } as Combatant
}

function player(id: string, initiative: number, dexMod = 0): Combatant {
  return { kind: 'player', id, name: id, initiative, dexMod }
}

function combatWith(...combatants: Combatant[]): CombatState {
  return combatants.reduce(addCombatant, createCombat())
}

function hpOf(state: CombatState, id: string) {
  const found = state.combatants.find((c) => c.id === id)
  if (!found || found.kind === 'player') throw new Error('geen vijand of NPC gevonden')
  return found.hp.current
}

describe('createCombat', () => {
  it('begint leeg in ronde 1 zonder beurt', () => {
    expect(createCombat()).toEqual({ combatants: [], round: 1, turnId: null })
  })
})

describe('addCombatant', () => {
  it('voegt een deelnemer toe zonder de oude state te wijzigen', () => {
    const before = createCombat()
    const after = addCombatant(before, enemy('goblin', 12))
    expect(after.combatants).toHaveLength(1)
    expect(before.combatants).toHaveLength(0)
  })

  it('weigert een dubbele id', () => {
    const state = combatWith(enemy('goblin', 12))
    expect(() => addCombatant(state, enemy('goblin', 8))).toThrow()
  })

  it('weigert huidige HP boven de maximale HP', () => {
    const invalid = enemy('goblin', 12, { hp: { current: 30, max: 20 } })
    expect(() => addCombatant(createCombat(), invalid)).toThrow()
  })
})

describe('rollInitiative', () => {
  it('geeft d20 plus de dexterity-modifier', () => {
    expect(rollInitiative(3, () => 0)).toBe(4)
    expect(rollInitiative(-1, () => 0.999999)).toBe(19)
  })
})

describe('initiativeOrder', () => {
  it('zet de hoogste initiative vooraan', () => {
    const state = combatWith(enemy('a', 8), player('speler', 17), enemy('b', 12))
    expect(initiativeOrder(state).map((c) => c.id)).toEqual(['speler', 'b', 'a'])
  })

  it('laat bij gelijke initiative de hoogste dexterity-modifier voorgaan', () => {
    const state = combatWith(enemy('traag', 12, { dexMod: 0 }), enemy('snel', 12, { dexMod: 3 }))
    expect(initiativeOrder(state).map((c) => c.id)).toEqual(['snel', 'traag'])
  })

  it('houdt bij gelijke initiative en modifier de volgorde van toevoegen aan', () => {
    const state = combatWith(enemy('eerst', 10), enemy('tweede', 10), enemy('derde', 10))
    expect(initiativeOrder(state).map((c) => c.id)).toEqual(['eerst', 'tweede', 'derde'])
  })

  it('wijzigt de state niet', () => {
    const state = combatWith(enemy('a', 5), enemy('b', 15))
    initiativeOrder(state)
    expect(state.combatants.map((c) => c.id)).toEqual(['a', 'b'])
  })
})

describe('applyDamage', () => {
  it('verlaagt de HP', () => {
    const state = applyDamage(combatWith(enemy('goblin', 10)), 'goblin', 7)
    expect(hpOf(state, 'goblin')).toBe(13)
  })

  it('laat de HP niet onder 0 komen', () => {
    const state = applyDamage(combatWith(enemy('goblin', 10)), 'goblin', 999)
    expect(hpOf(state, 'goblin')).toBe(0)
  })

  it('wijzigt de oude state niet', () => {
    const before = combatWith(enemy('goblin', 10))
    applyDamage(before, 'goblin', 5)
    expect(hpOf(before, 'goblin')).toBe(20)
  })

  it('geeft een fout bij een onbekende id, negatieve schade of een speler', () => {
    const state = combatWith(enemy('goblin', 10), player('speler', 15))
    expect(() => applyDamage(state, 'orc', 3)).toThrow()
    expect(() => applyDamage(state, 'goblin', -1)).toThrow()
    expect(() => applyDamage(state, 'speler', 3)).toThrow()
  })
})

describe('heal', () => {
  it('verhoogt de HP', () => {
    const hurt = enemy('goblin', 10, { hp: { current: 5, max: 20 } })
    expect(hpOf(heal(combatWith(hurt), 'goblin', 6), 'goblin')).toBe(11)
  })

  it('laat de HP niet boven het maximum komen', () => {
    const hurt = enemy('goblin', 10, { hp: { current: 18, max: 20 } })
    expect(hpOf(heal(combatWith(hurt), 'goblin', 50), 'goblin')).toBe(20)
  })

  it('geeft een fout bij negatieve genezing of een speler', () => {
    const state = combatWith(enemy('goblin', 10), player('speler', 15))
    expect(() => heal(state, 'goblin', -2)).toThrow()
    expect(() => heal(state, 'speler', 2)).toThrow()
  })
})

describe('isDown', () => {
  it('is waar voor een vijand of NPC op 0 HP', () => {
    const down = enemy('goblin', 10, { hp: { current: 0, max: 20 } })
    expect(isDown(down)).toBe(true)
    expect(isDown(enemy('orc', 10))).toBe(false)
  })

  it('is nooit waar voor een speler', () => {
    expect(isDown(player('speler', 10))).toBe(false)
  })
})

describe('conditions', () => {
  it('voegt een condition toe', () => {
    const state = addCondition(combatWith(enemy('goblin', 10)), 'goblin', 'prone')
    const goblin = state.combatants[0]
    expect(goblin.kind === 'player' ? [] : goblin.conditions).toEqual(['prone'])
  })

  it('voegt dezelfde condition niet dubbel toe', () => {
    let state = combatWith(enemy('goblin', 10))
    state = addCondition(state, 'goblin', 'poisoned')
    state = addCondition(state, 'goblin', 'poisoned')
    const goblin = state.combatants[0]
    expect(goblin.kind === 'player' ? [] : goblin.conditions).toEqual(['poisoned'])
  })

  it('verwijdert een condition en negeert een condition die ontbreekt', () => {
    let state = combatWith(enemy('goblin', 10, { conditions: ['prone', 'blinded'] }))
    state = removeCondition(state, 'goblin', 'prone')
    state = removeCondition(state, 'goblin', 'stunned')
    const goblin = state.combatants[0]
    expect(goblin.kind === 'player' ? [] : goblin.conditions).toEqual(['blinded'])
  })

  it('geeft een fout bij een onbekende id of een speler', () => {
    const state = combatWith(enemy('goblin', 10), player('speler', 15))
    expect(() => addCondition(state, 'orc', 'prone')).toThrow()
    expect(() => addCondition(state, 'speler', 'prone')).toThrow()
  })
})

describe('beurten', () => {
  it('geeft de eerste beurt aan de hoogste initiative', () => {
    const state = startCombat(combatWith(enemy('a', 8), player('speler', 17)))
    expect(currentCombatant(state)?.id).toBe('speler')
    expect(state.round).toBe(1)
  })

  it('gaat met nextTurn naar de volgende deelnemer', () => {
    let state = startCombat(combatWith(player('speler', 17), enemy('b', 12), enemy('a', 8)))
    state = nextTurn(state)
    expect(currentCombatant(state)?.id).toBe('b')
    state = nextTurn(state)
    expect(currentCombatant(state)?.id).toBe('a')
  })

  it('begint een nieuwe ronde na de laatste deelnemer', () => {
    let state = startCombat(combatWith(player('speler', 17), enemy('a', 8)))
    state = nextTurn(state)
    state = nextTurn(state)
    expect(currentCombatant(state)?.id).toBe('speler')
    expect(state.round).toBe(2)
  })

  it("slaat vijanden en NPC's op 0 HP over", () => {
    const down = enemy('b', 12, { hp: { current: 0, max: 20 } })
    let state = startCombat(combatWith(player('speler', 17), down, enemy('a', 8)))
    state = nextTurn(state)
    expect(currentCombatant(state)?.id).toBe('a')
  })

  it('slaat een vijand over die tijdens het gevecht op 0 HP komt', () => {
    let state = startCombat(combatWith(player('speler', 17), enemy('b', 12), enemy('a', 8)))
    state = applyDamage(state, 'b', 999)
    state = nextTurn(state)
    expect(currentCombatant(state)?.id).toBe('a')
  })

  it('laat de huidige beurt ongemoeid als er iemand wordt toegevoegd', () => {
    let state = startCombat(combatWith(player('speler', 17), enemy('a', 8)))
    state = addCombatant(state, enemy('nieuw', 20))
    expect(currentCombatant(state)?.id).toBe('speler')
    state = nextTurn(state)
    expect(currentCombatant(state)?.id).toBe('a')
  })

  it('geeft een fout bij het starten zonder deelnemers', () => {
    expect(() => startCombat(createCombat())).toThrow()
  })

  it('geeft een fout als niemand meer kan handelen', () => {
    const down = enemy('a', 8, { hp: { current: 0, max: 20 } })
    expect(() => startCombat(combatWith(down))).toThrow()
  })

  it('geeft geen huidige deelnemer voor een gevecht dat niet is gestart', () => {
    expect(currentCombatant(combatWith(enemy('a', 8)))).toBeUndefined()
  })

  it('geeft een fout bij nextTurn voor een gevecht dat niet is gestart', () => {
    expect(() => nextTurn(combatWith(enemy('a', 8)))).toThrow()
  })
})
