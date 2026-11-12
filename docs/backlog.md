# Backlog

Eén story per sessie. De testlijst is het acceptatiecriterium. Zie de Definition of Done in
[CLAUDE.md](../CLAUDE.md).

## Klaar

- **S1: Repo-skelet en dobbelstenen.** Vite, React, TypeScript, Vitest, oxlint, Prettier, CI,
  `parseDice`, `rollDice` en een seeded rng.
- **S2: Engine-state voor vijanden en NPC's.** Combatants met HP, AC en conditions, initiative-
  volgorde, schade en genezing, beurten en rondes (`src/engine/combat.ts`).

## Gepland

Volgorde is een voorstel, de speler bepaalt de prioriteit.

1. **S3: Engine-tools.** Worp voor een vijand (aanval, schade, save) als tool met zod-schema.
   Tests: onbekende vijand geeft een fout, uitkomst bevat het aanvalstotaal, schade met type.
2. **S4: Provider-interface en eerste adapter.** Intern tool-formaat, een adapter met
   gemockte responses. Tests: tool-aanroep heen en terug, streaming, foutafhandeling.
3. **S5: Overige adapters.** OpenRouter, OpenAI en Google achter dezelfde interface.
4. **S6: Opslag.** Dexie-schema voor campagnes, export en import zonder API-key.
5. **S7: Avontuur-import.** Markdown naar beats met een gemockt model. Tests: opdeling van een
   voorbeeld-avontuur, ruimtes en uitgangen.
6. **S8: Personage-import.** pdf.js leest formuliervelden, terugval op tekst.
7. **S9: Context-bouwer.** Kern, protocol, personage, beat, kaart en log tot een prompt.
8. **S10: Orchestrator.** De beurtlus met tool-uitvoering.
9. **S11: Chat en zijpaneel.** Interface voor invoer, uitvoer en campagnebeheer.
10. **S12: Sessielog en samenvatting.** Automatisch log en samenvatting van lange sessies.
11. **S13: Modelscenario's.** Vijf scenario's, uitvoerbaar tegen elk gekoppeld model.

## Ideeën

- Secure rng voor productie (`crypto.getRandomValues`) naast de seeded rng voor tests.
