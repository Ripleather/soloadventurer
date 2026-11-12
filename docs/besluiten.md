# Besluitenlog

Nieuwste bovenaan. De architectuurbesluiten staan in [architectuur.md](architectuur.md).

## 2026-11-12

- Licentie: MIT. Afhankelijkheden (React, Vite, Dexie, pdf.js, Zod) zijn combineerbaar met MIT.
- Repo eerst: de repository staat vanaf het begin op GitHub, en een story is af wanneer de
  wijziging daar staat en de CI groen is.
- Pakketbeheer: npm.
- Linter: oxlint, zoals de Vite-template die levert. Opmaak: Prettier.
- Testrunner: Vitest, met een injecteerbare rng voor alle engine-tests.
- Deploy: statische build naar GitHub Pages, basispad `/soloadventurer/`.
- Taal van de documentatie: Nederlands.
- SRD-bronvermelding komt in `NOTICE` zodra spelregeldata wordt opgenomen.
