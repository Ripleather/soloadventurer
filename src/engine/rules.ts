import { rollDice, type DiceSpec } from './dice'
import type { Rng } from './rng'

/**
 * Regels die per tafel kunnen verschillen. De engine vraagt de regels mee in plaats van ze vast te
 * leggen, zodat een andere huisregel een andere `Rules` is en geen wijziging in de engine.
 */
export type Rules = {
  /** Schade van een crit. `rolls` zijn de dobbelstenen die voor de crit zijn gerold. */
  critDamage: (spec: DiceSpec, rng: Rng) => { total: number; rolls: number[] }
  /** Telt een natuurlijke 1 op een save als mislukking, wat het totaal ook is. */
  natOneSaveFails: boolean
}

/** 5e 2014 volgens het boek: alle schadedice twee keer rollen, modifier één keer. */
export const standardRules: Rules = {
  critDamage: (spec, rng) => {
    const { rolls, total } = rollDice(`${spec.count * 2}d${spec.sides}`, rng)
    return { total: total + spec.modifier, rolls }
  },
  natOneSaveFails: false,
}

/** Houserules van Niels: maximale dice, plus modifier, plus één extra worp van dezelfde dice. */
export const houseRules: Rules = {
  critDamage: (spec, rng) => {
    const { rolls, total } = rollDice(`${spec.count}d${spec.sides}`, rng)
    return { total: spec.count * spec.sides + spec.modifier + total, rolls }
  },
  natOneSaveFails: true,
}
