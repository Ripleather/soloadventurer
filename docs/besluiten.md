# Besluitenlog

Nieuwste bovenaan. De architectuurbesluiten staan in [architectuur.md](architectuur.md).

## 2026-11-12

- Review van S1 en S2 (aparte agent): validatie van deelnemers (eindige getallen, geen negatieve HP),
  kopie bij toevoegen, `startCombat` weigert een gestart gevecht, `parseDice` weigert spaties tussen
  cijfers en begrenst zijden en modifier op 1000. 0 HP betekent voor vijanden en NPC's
  "uitgeschakeld" en de beurt wordt overgeslagen; onderscheid tussen dood en bewusteloos en
  death saves voor NPC-bondgenoten volgen later.
- Combat-state (`src/engine/combat.ts`): onveranderlijke pure functies, elke wijziging geeft een nieuwe
  state. Volgorde bij gelijke initiative: hoogste dexterity-modifier, daarna volgorde van toevoegen.
  `nextTurn` slaat vijanden en NPC's op 0 HP over; de ronde loopt op bij het omslaan van de volgorde.
  De speler staat in de volgorde maar zonder HP of condities: die beheert hij zelf. Exhaustion is
  geen aan/uit-conditie en valt buiten de conditielijst.
- Licentie: MIT. Afhankelijkheden (React, Vite, Dexie, pdf.js, Zod) zijn combineerbaar met MIT.
- Repo eerst: de repository staat vanaf het begin op GitHub, en een story is af wanneer de
  wijziging daar staat en de CI groen is.
- Pakketbeheer: npm.
- Linter: oxlint, zoals de Vite-template die levert. Opmaak: Prettier.
- Testrunner: Vitest, met een injecteerbare rng voor alle engine-tests.
- Deploy: statische build naar GitHub Pages, basispad `/soloadventurer/`.
- Taal van de documentatie: Nederlands.
- SRD-bronvermelding komt in `NOTICE` zodra spelregeldata wordt opgenomen.
