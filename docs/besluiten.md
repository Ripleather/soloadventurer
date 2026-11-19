# Besluitenlog

Nieuwste bovenaan. De architectuurbesluiten staan in [architectuur.md](architectuur.md).

## 2026-11-19

- Kosten: de app is vanaf versie 1 kosteloos. De enige kosten zijn die van het model dat de speler
  zelf koppelt. De app bevat geen betaalde dienst, geen abonnement en geen eigen server. Er is altijd
  een gratis route, nu via de gratis modellen van OpenRouter (`:free`), later ook via Google en
  lokale modellen.

- Modeltest (`probe.html`, `src/probe/`): een losse pagina op GitHub Pages om een echt model via
  OpenRouter te testen, ook vanaf een telefoon. Een goblin valt aan; het model moet `enemy_attack`
  aanroepen en daarna vertellen. De key staat alleen in het geheugen van de pagina. Geen onderdeel van
  de MVP-interface; hij blijft bestaan als handmatige rooktest naast de modelscenario's van S13.

- Provider-laag (`src/providers/`): één intern formaat (`types.ts`) met `chat` en `stream`, en een
  eerste adapter voor OpenRouter. OpenRouter eerst, omdat je daarmee meteen veel modellen test, ook
  kleine.
- Het interne formaat is na review ingericht op alle vier aanbieders: systeemprompt apart in
  `ChatRequest.system`, berichten van de speler kunnen afbeeldingen bevatten (de DM-kaart),
  tool-resultaten dragen de toolnaam en een `isError`-vlag, assistent-berichten dragen ondoorzichtige
  `providerData` (redenering die terug moet), en `maxTokens` is optioneel.
- Tool-argumenten die geen geldig JSON-object zijn, krijgen `input: undefined` en een `parseError`;
  het zod-schema wijst ze dan af. De ruwe tekst gaat ongewijzigd terug in de geschiedenis.
- Elke fout uit de provider-laag is een `ProviderError` met een soort en zonder oorzaak. De API-key
  wordt uit elke melding gehaald vóór het inkorten.

## 2026-11-13

- Engine-tools (`src/engine/tools.ts`): `executeAttack` en `executeSave` valideren hun invoer met
  zod-schema's (strikt, onbekende velden zijn een fout) en wijzigen de state niet. Het toepassen van
  schade op een doel is een aparte stap via `applyDamage`. De speler is nooit aanvaller of
  verdediger in deze tools: de speler rolt zelf.
- Regels die per tafel verschillen staan in `Rules` (`src/engine/rules.ts`) en worden aan de tools
  meegegeven. `houseRules` is de set van Niels (crit: maximale dice, plus modifier, plus één extra
  worp; natuurlijke 1 op een save mislukt), `standardRules` is 5e 2014 volgens het boek. Een andere
  huisregel is een andere `Rules`, geen wijziging in de engine.
- Review van S3 verwerkt: schade is nooit negatief (stopt op 0, want `applyDamage` weigert negatieve
  bedragen), de standaard crit werkt ook bij veel dice, en de fouttests controleren de boodschap.
- Aanvallen nemen `targetAc` van de aanroeper aan, omdat de engine de AC van de speler niet bijhoudt.

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
