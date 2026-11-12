import { describe, expect, it } from 'vitest'
import { createRng } from './rng'
import { parseDice, rollDice } from './dice'

describe('parseDice', () => {
  it('leest aantal, zijden en modifier uit 2d6+3', () => {
    expect(parseDice('2d6+3')).toEqual({ count: 2, sides: 6, modifier: 3 })
  })

  it('neemt één dobbelsteen aan als het aantal ontbreekt', () => {
    expect(parseDice('d20')).toEqual({ count: 1, sides: 20, modifier: 0 })
  })

  it('leest een negatieve modifier', () => {
    expect(parseDice('1d8-1')).toEqual({ count: 1, sides: 8, modifier: -1 })
  })

  it('negeert spaties en hoofdletters', () => {
    expect(parseDice(' 3D4 + 2 ')).toEqual({ count: 3, sides: 4, modifier: 2 })
  })

  it('weigert ongeldige notatie', () => {
    expect(() => parseDice('banana')).toThrow()
    expect(() => parseDice('2d')).toThrow()
    expect(() => parseDice('')).toThrow()
  })

  it('weigert een aantal van 0 of meer dan 100 en minder dan 2 zijden', () => {
    expect(() => parseDice('0d6')).toThrow()
    expect(() => parseDice('101d6')).toThrow()
    expect(() => parseDice('1d1')).toThrow()
  })
})

describe('parseDice, randgevallen', () => {
  it('weigert onvolledige of onmogelijke notatie', () => {
    for (const bad of ['d0', 'd1', '2d6+', '2d6-', '-1d6', '1.5d6', '2d6+1+1', '2d6 3', '2 3d6']) {
      expect(() => parseDice(bad), bad).toThrow()
    }
  })

  it('accepteert spaties rond de modifier', () => {
    expect(parseDice('2d6 - 1')).toEqual({ count: 2, sides: 6, modifier: -1 })
  })

  it('weigert te veel zijden of een te grote modifier', () => {
    expect(() => parseDice('d1001')).toThrow()
    expect(() => parseDice('d20+1001')).toThrow()
    expect(() => parseDice('d99999999999999999999')).toThrow()
    expect(parseDice('d1000+1000')).toEqual({ count: 1, sides: 1000, modifier: 1000 })
  })
})

describe('rollDice', () => {
  it('gebruikt de rng precies één keer per dobbelsteen, in volgorde', () => {
    const values = [0, 0.5, 0.999999]
    let calls = 0
    const rng = () => values[calls++]
    expect(rollDice('3d6', rng).rolls).toEqual([1, 4, 6])
    expect(calls).toBe(3)
  })

  it('geeft het minimum bij een rng die altijd 0 teruggeeft', () => {
    const result = rollDice('3d6+2', () => 0)
    expect(result.rolls).toEqual([1, 1, 1])
    expect(result.total).toBe(5)
  })

  it('geeft het maximum bij een rng die net onder 1 blijft', () => {
    const result = rollDice('2d8', () => 0.999999)
    expect(result.rolls).toEqual([8, 8])
    expect(result.total).toBe(16)
  })

  it('telt de modifier mee, ook als die negatief is', () => {
    const result = rollDice('1d4-3', () => 0.5)
    expect(result.rolls).toEqual([3])
    expect(result.modifier).toBe(-3)
    expect(result.total).toBe(0)
  })

  it('geeft met dezelfde seed dezelfde worpen', () => {
    const a = rollDice('10d20', createRng(42))
    const b = rollDice('10d20', createRng(42))
    expect(a).toEqual(b)
  })

  it('houdt elke worp binnen 1 en het aantal zijden', () => {
    const rng = createRng(7)
    for (let i = 0; i < 500; i++) {
      const { rolls } = rollDice('4d10', rng)
      for (const roll of rolls) {
        expect(roll).toBeGreaterThanOrEqual(1)
        expect(roll).toBeLessThanOrEqual(10)
      }
    }
  })
})

describe('createRng', () => {
  it('geeft waarden in [0, 1)', () => {
    const rng = createRng(1)
    for (let i = 0; i < 1000; i++) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('geeft een vaste reeks voor een vaste seed', () => {
    const rng = createRng(42)
    expect([rng(), rng(), rng()]).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099,
    ])
  })

  it('geeft verschillende reeksen voor verschillende seeds', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()])
  })
})
