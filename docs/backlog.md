# Backlog

Eén story per sessie. De testlijst is het acceptatiecriterium. Zie de Definition of Done in
[CLAUDE.md](../CLAUDE.md).

## Klaar

- **S1: Repo-skelet en dobbelstenen.** Vite, React, TypeScript, Vitest, oxlint, Prettier, CI,
  `parseDice`, `rollDice` en een seeded rng.
- **S2: Engine-state voor vijanden en NPC's.** Combatants met HP, AC en conditions, initiative-
  volgorde, schade en genezing, beurten en rondes (`src/engine/combat.ts`).

- **S3: Engine-tools.** Aanval en save voor vijanden en NPC's met zod-schema's en wisselbare
  `Rules` (`src/engine/tools.ts`, `src/engine/rules.ts`).

## Gepland

Volgorde is een voorstel, de speler bepaalt de prioriteit.

1. **S4: Provider-interface en eerste adapter.** Intern tool-formaat, een adapter met
   gemockte responses. Tests: tool-aanroep heen en terug, streaming, foutafhandeling.
2. **S5: Overige adapters.** OpenRouter, OpenAI en Google achter dezelfde interface.
3. **S6: Opslag.** Dexie-schema voor campagnes, export en import zonder API-key.
4. **S7: Avontuur-import.** Markdown naar beats met een gemockt model. Tests: opdeling van een
   voorbeeld-avontuur, ruimtes en uitgangen.
5. **S8: Personage-import.** pdf.js leest formuliervelden, terugval op tekst.
6. **S9: Context-bouwer.** Kern, protocol, personage, beat, kaart en log tot een prompt.
7. **S10: Orchestrator.** De beurtlus met tool-uitvoering.
8. **S11: Chat en zijpaneel.** Interface voor invoer, uitvoer en campagnebeheer.
9. **S12: Sessielog en samenvatting.** Automatisch log en samenvatting van lange sessies.
10. **S13: Modelscenario's.** Vijf scenario's, uitvoerbaar tegen elk gekoppeld model.

## Ideeën

- Conditions uit de tool-aanroep van het model valideren met `CONDITIONS` in het zod-schema.
- Deelnemer verwijderen en einde van het gevecht herkennen (nu geeft `nextTurn` een nieuwe ronde
  per aanroep als alleen de speler overblijft).
- `rollInitiative` hergebruikt `Rng` en `rollDice`; de rng op bereik `[0, 1)` laten controleren.
- Secure rng voor productie (`crypto.getRandomValues`) naast de seeded rng voor tests.
