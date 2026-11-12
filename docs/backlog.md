# Backlog

Eén story per sessie. De testlijst is het acceptatiecriterium. Zie de Definition of Done in
[CLAUDE.md](../CLAUDE.md).

## Klaar

- **S1: Repo-skelet en dobbelstenen.** Vite, React, TypeScript, Vitest, oxlint, Prettier, CI,
  `parseDice`, `rollDice` en een seeded rng.

## Gepland

Volgorde is een voorstel, de speler bepaalt de prioriteit.

1. **S2: Engine-state voor vijanden en NPC's.** Combatant met HP, AC en conditions, initiative
   bijhouden. Tests: volgorde bij gelijke initiative, HP daalt en stijgt niet boven maximum,
   conditions toevoegen en verwijderen.
2. **S3: Engine-tools.** Worp voor een vijand (aanval, schade, save) als tool met zod-schema.
   Tests: onbekende vijand geeft een fout, uitkomst bevat het aanvalstotaal, schade met type.
3. **S4: Provider-interface en eerste adapter.** Intern tool-formaat, een adapter met
   gemockte responses. Tests: tool-aanroep heen en terug, streaming, foutafhandeling.
4. **S5: Overige adapters.** OpenRouter, OpenAI en Google achter dezelfde interface.
5. **S6: Opslag.** Dexie-schema voor campagnes, export en import zonder API-key.
6. **S7: Avontuur-import.** Markdown naar beats met een gemockt model. Tests: opdeling van een
   voorbeeld-avontuur, ruimtes en uitgangen.
7. **S8: Personage-import.** pdf.js leest formuliervelden, terugval op tekst.
8. **S9: Context-bouwer.** Kern, protocol, personage, beat, kaart en log tot een prompt.
9. **S10: Orchestrator.** De beurtlus met tool-uitvoering.
10. **S11: Chat en zijpaneel.** Interface voor invoer, uitvoer en campagnebeheer.
11. **S12: Sessielog en samenvatting.** Automatisch log en samenvatting van lange sessies.
12. **S13: Modelscenario's.** Vijf scenario's, uitvoerbaar tegen elk gekoppeld model.

## Ideeën

- Secure rng voor productie (`crypto.getRandomValues`) naast de seeded rng voor tests.
