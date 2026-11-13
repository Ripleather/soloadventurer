import { describe, expect, it } from 'vitest'
import { addCombatant, createCombat, type Combatant, type CombatState } from './combat'
import { houseRules, standardRules, type Rules } from './rules'
import { attackInputSchema, executeAttack, executeSave, saveInputSchema } from './tools'

/** Rng die vaste waarden teruggeeft; een d20 van 15 is 0.7, een d8 van 8 is 0.99. */
function scripted(values: number[]) {
  let index = 0
  return () => {
    if (index >= values.length) throw new Error('rng vaker aangeroepen dan verwacht')
    return values[index++]
  }
}

// d20-uitkomst naar rng-waarde: (n - 1) / 20 + een kleine marge tegen afrondingsfouten.
const d20 = (n: number) => (n - 1) / 20 + 0.001
// Dobbelsteen met `sides` zijden naar rng-waarde.
const die = (n: number, sides: number) => (n - 1) / sides + 0.001

function goblin(overrides: Partial<Combatant> = {}): Combatant {
  return {
    kind: 'enemy',
    id: 'goblin',
    name: 'Goblin',
    initiative: 12,
    dexMod: 2,
    ac: 15,
    hp: { current: 7, max: 7 },
    conditions: [],
    ...overrides,
  } as Combatant
}

function arena(...extra: Combatant[]): CombatState {
  const speler: Combatant = {
    kind: 'player',
    id: 'speler',
    name: 'Milly',
    initiative: 14,
    dexMod: 1,
  }
  return [goblin(), speler, ...extra].reduce(addCombatant, createCombat())
}

const aanval = {
  attackerId: 'goblin',
  attackBonus: 4,
  targetAc: 15,
  damage: '1d8+3',
  damageType: 'slashing',
}

describe('executeAttack', () => {
  it('geeft het aanvalstotaal: d20 plus aanvalsbonus', () => {
    const result = executeAttack(arena(), aanval, scripted([d20(12), die(1, 8)]), houseRules)
    expect(result.d20).toBe(12)
    expect(result.total).toBe(16)
    expect(result.targetAc).toBe(15)
  })

  it('raakt bij een totaal gelijk aan of boven de AC en mist eronder', () => {
    const raak = executeAttack(arena(), aanval, scripted([d20(11), die(4, 8)]), houseRules)
    expect(raak.outcome).toBe('hit')
    const mis = executeAttack(arena(), aanval, scripted([d20(10)]), houseRules)
    expect(mis.outcome).toBe('miss')
    expect(mis.damage).toBeUndefined()
  })

  it('rolt schade met type bij een treffer: dice plus modifier', () => {
    const result = executeAttack(arena(), aanval, scripted([d20(15), die(5, 8)]), houseRules)
    expect(result.damage).toEqual({ total: 8, type: 'slashing', rolls: [5] })
  })

  it('mist bij een natuurlijke 1, ook als het totaal hoog genoeg is', () => {
    const result = executeAttack(
      arena(),
      { ...aanval, attackBonus: 30 },
      scripted([d20(1)]),
      houseRules,
    )
    expect(result.outcome).toBe('miss')
    expect(result.damage).toBeUndefined()
  })

  it('raakt bij een natuurlijke 20 als crit, ook als het totaal te laag is', () => {
    const result = executeAttack(
      arena(),
      { ...aanval, attackBonus: -10 },
      scripted([d20(20), die(1, 8)]),
      houseRules,
    )
    expect(result.outcome).toBe('crit')
  })

  it('rekent een crit volgens de houserule: maximale dice, modifier en één extra worp', () => {
    const result = executeAttack(arena(), aanval, scripted([d20(20), die(5, 8)]), houseRules)
    expect(result.damage).toEqual({ total: 8 + 3 + 5, type: 'slashing', rolls: [5] })
  })

  it('rekent een crit met andere regels anders, zonder de engine te wijzigen', () => {
    const result = executeAttack(
      arena(),
      aanval,
      scripted([d20(20), die(2, 8), die(6, 8)]),
      standardRules,
    )
    expect(result.damage).toEqual({ total: 2 + 6 + 3, type: 'slashing', rolls: [2, 6] })
  })

  it('laat de regels vervangen door een eigen set', () => {
    const dubbel: Rules = {
      ...houseRules,
      critDamage: (spec) => ({ total: (spec.count * spec.sides + spec.modifier) * 2, rolls: [] }),
    }
    const result = executeAttack(arena(), aanval, scripted([d20(20)]), dubbel)
    expect(result.damage?.total).toBe(22)
  })

  it('neemt bij advantage de hoogste en bij disadvantage de laagste d20', () => {
    const adv = executeAttack(
      arena(),
      { ...aanval, advantage: 'advantage' },
      scripted([d20(3), d20(17), die(1, 8)]),
      houseRules,
    )
    expect(adv.rolls).toEqual([3, 17])
    expect(adv.d20).toBe(17)
    const dis = executeAttack(
      arena(),
      { ...aanval, advantage: 'disadvantage' },
      scripted([d20(3), d20(17)]),
      houseRules,
    )
    expect(dis.d20).toBe(3)
  })

  it('geeft een fout voor een onbekende aanvaller', () => {
    expect(() =>
      executeAttack(arena(), { ...aanval, attackerId: 'draak' }, scripted([]), houseRules),
    ).toThrow(/draak/)
  })

  it('geeft een fout als de speler wordt opgegeven: de speler rolt zelf', () => {
    expect(() =>
      executeAttack(arena(), { ...aanval, attackerId: 'speler' }, scripted([]), houseRules),
    ).toThrow()
  })

  it('geeft een fout voor een uitgeschakelde aanvaller', () => {
    const state = [goblin({ hp: { current: 0, max: 7 } })].reduce(addCombatant, createCombat())
    expect(() => executeAttack(state, aanval, scripted([]), houseRules)).toThrow()
  })

  it('geeft een fout bij ongeldige invoer', () => {
    const slecht = [
      { ...aanval, damageType: 'kwaadaardig' },
      { ...aanval, damage: 'veel' },
      { ...aanval, attackBonus: 1.5 },
      { ...aanval, advantage: 'soms' },
      { ...aanval, targetAc: undefined },
    ]
    for (const invoer of slecht) {
      expect(() => executeAttack(arena(), invoer, scripted([]), houseRules)).toThrow()
    }
  })

  it('wijzigt de state niet', () => {
    const state = arena()
    const kopie = structuredClone(state)
    executeAttack(state, aanval, scripted([d20(15), die(3, 8)]), houseRules)
    expect(state).toEqual(kopie)
  })
})

describe('executeSave', () => {
  const save = { creatureId: 'goblin', bonus: 2, dc: 13 }

  it('geeft het totaal en slaagt bij een totaal gelijk aan of boven de DC', () => {
    const slaagt = executeSave(arena(), save, scripted([d20(11)]), houseRules)
    expect(slaagt).toMatchObject({ d20: 11, total: 13, dc: 13, success: true })
    const faalt = executeSave(arena(), save, scripted([d20(10)]), houseRules)
    expect(faalt.success).toBe(false)
  })

  it('laat een natuurlijke 1 mislukken volgens de houserule', () => {
    const result = executeSave(arena(), { ...save, bonus: 30 }, scripted([d20(1)]), houseRules)
    expect(result.success).toBe(false)
  })

  it('telt een natuurlijke 1 gewoon mee onder standaardregels', () => {
    const result = executeSave(arena(), { ...save, bonus: 30 }, scripted([d20(1)]), standardRules)
    expect(result.success).toBe(true)
  })

  it('laat een natuurlijke 20 niet automatisch slagen', () => {
    const result = executeSave(arena(), { ...save, bonus: -10 }, scripted([d20(20)]), houseRules)
    expect(result.success).toBe(false)
  })

  it('neemt bij advantage de hoogste en bij disadvantage de laagste d20', () => {
    const adv = executeSave(
      arena(),
      { ...save, advantage: 'advantage' },
      scripted([d20(4), d20(18)]),
      houseRules,
    )
    expect(adv.d20).toBe(18)
    const dis = executeSave(
      arena(),
      { ...save, advantage: 'disadvantage' },
      scripted([d20(4), d20(18)]),
      houseRules,
    )
    expect(dis.d20).toBe(4)
  })

  it('geeft een fout voor een onbekende wezen, de speler of ongeldige invoer', () => {
    expect(() =>
      executeSave(arena(), { ...save, creatureId: 'draak' }, scripted([]), houseRules),
    ).toThrow(/draak/)
    expect(() =>
      executeSave(arena(), { ...save, creatureId: 'speler' }, scripted([]), houseRules),
    ).toThrow()
    expect(() => executeSave(arena(), { ...save, dc: 'hoog' }, scripted([]), houseRules)).toThrow()
  })
})

describe("schema's", () => {
  it('leiden het invoertype af en weigeren onbekende velden niet stil', () => {
    expect(attackInputSchema.safeParse(aanval).success).toBe(true)
    expect(saveInputSchema.safeParse({ creatureId: 'goblin', bonus: 2, dc: 13 }).success).toBe(true)
    expect(attackInputSchema.safeParse({ ...aanval, extra: 1 }).success).toBe(false)
  })
})
