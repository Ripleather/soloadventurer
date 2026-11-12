# Werkafspraken voor Solo Adventurer

Lees bij de start van elke sessie `docs/architectuur.md`, `docs/besluiten.md` en `docs/backlog.md`.

## Samenwerking

- Communiceer in het Nederlands. Code, commentaar in code en bestandsnamen zijn Nederlands of
  Engels zoals de omgeving al doet; testbeschrijvingen zijn Nederlands.
- Stel één vraag tegelijk wanneer een keuze open ligt, en neem een stelling in met de vraag.
- Voeg geen informatie toe die niet gevraagd is.

## Werkwijze

- TDD: schrijf eerst de test, controleer dat hij rood is, schrijf dan de code.
- Eén story uit `docs/backlog.md` per sessie, met de testlijst als acceptatiecriteria.
- Een story is af (Definition of Done) wanneer:
  1. de tests groen zijn, ook de nieuwe,
  2. `npm run check` slaagt (lint, typecheck, tests, opmaak),
  3. de wijziging op GitHub staat en de CI groen is,
  4. kernonderdelen (engine, provider-laag) door een aparte review zijn gegaan,
  5. `docs/` is bijgewerkt waar het besluiten of de opzet raakt.
- Besluiten die iets vastleggen komen in `docs/besluiten.md` met datum.

## Ontwerpregels (vast, zie docs/architectuur.md)

- Clientside, geen server. API-keys verlaten de browser alleen richting de gekozen aanbieder.
- De speler rolt altijd zelf. De engine rolt voor vijanden en NPC's en het model ziet het
  resultaat pas na de worp.
- Elke wijziging van de spelstand loopt via een tool van de engine. De app haalt geen state uit
  proza van het model.
- De regelengine in `src/engine/` is pure TypeScript zonder I/O, met een injecteerbare rng.
- Een export van een campagne bevat nooit een API-key.

## Commando's

```sh
npm run dev | test | test:watch | lint | typecheck | format | check | build
```
