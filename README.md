# Solo Adventurer

Speel D&D 5e (2014) solo met een LLM naar keuze als spelleider. De app draait volledig in de
browser: geen server, geen account. Je brengt je eigen API-key, avonturen en personage mee.

Status: in aanbouw. De regelengine (dobbelstenen) is het eerste onderdeel.

## Idee in het kort

- Eén speler per campagne, chat als in- en uitvoer.
- Een regelengine in code bepaalt elke uitkomst met een getal. Het model schrijft de narratie.
- De speler rolt altijd zelf en meldt de uitkomst in de chat.
- Avonturen komen als markdown, het personage als pdf (MPMB of D&D Beyond).
- Campagnes staan in de browser (IndexedDB) en zijn te exporteren en importeren.

De volledige opzet staat in [docs/architectuur.md](docs/architectuur.md).

## Ontwikkelen

Vereist Node 22 of nieuwer.

```sh
npm install
npm run dev        # lokale ontwikkelserver
npm run check      # lint, typecheck, tests en opmaakcontrole
npm run build      # statische build in dist/
```

Werkwijze: TDD. Schrijf eerst de test, zie hem falen, maak hem groen. De afspraken staan in
[CLAUDE.md](CLAUDE.md) en de geplande werkpakketten in [docs/backlog.md](docs/backlog.md).

## Licentie

MIT, zie [LICENSE](LICENSE) en [NOTICE](NOTICE).
