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
- **S4: Provider-interface en OpenRouter-adapter.** Intern formaat met tekst, afbeeldingen en
  tool-aanroepen, `chat` en `stream`, foutsoorten zonder lekken van de key (`src/providers/`).

## Gepland

Volgorde is een voorstel, de speler bepaalt de prioriteit.

1. **S5: Overige adapters.** Anthropic, OpenAI en Google achter dezelfde interface.
2. **S6: Opslag.** Dexie-schema voor campagnes, export en import zonder API-key.
3. **S7: Avontuur-import.** Markdown naar beats met een gemockt model. Tests: opdeling van een
   voorbeeld-avontuur, ruimtes en uitgangen.
4. **S8: Personage-import.** pdf.js leest formuliervelden, terugval op tekst.
5. **S9: Context-bouwer.** Kern, protocol, personage, beat, kaart en log tot een prompt.
6. **S10: Orchestrator.** De beurtlus met tool-uitvoering.
7. **S11: Chat en zijpaneel.** Interface voor invoer, uitvoer en campagnebeheer.
8. **S12: Sessielog en samenvatting.** Automatisch log en samenvatting van lange sessies.
9. **S13: Modelscenario's.** Vijf scenario's, uitvoerbaar tegen elk gekoppeld model.

## Ideeën

- `reasoning_details` in stream-modus opvangen; nu alleen bij `chat`.
- OpenAI-formaat kent geen foutvlag op een tool-resultaat: de orchestrator zet bij `isError` een
  duidelijke foutmelding in de inhoud.
- Crit-drempel (bijv. 19-20) en de natuurlijke-1-regel voor aanvallen in `Rules` zetten; nu staan ze
  vast in de engine.
- Resultaat van een crit toont alleen de extra worp in `rolls`; een `breakdown` met de maximale dice
  maakt de uitkomst voor de DM-tekst duidelijker.
- Beslissen of een save ook buiten een gevecht of voor een uitgeschakeld wezen kan (val, vergiftiging,
  area-effect). Nu moet het wezen in de `CombatState` staan.
- Conditions uit de tool-aanroep van het model valideren met `CONDITIONS` in het zod-schema.
- Deelnemer verwijderen en einde van het gevecht herkennen (nu geeft `nextTurn` een nieuwe ronde
  per aanroep als alleen de speler overblijft).
- `rollInitiative` hergebruikt `Rng` en `rollDice`; de rng op bereik `[0, 1)` laten controleren.
- Secure rng voor productie (`crypto.getRandomValues`) naast de seeded rng voor tests.
