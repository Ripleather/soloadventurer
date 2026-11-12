# Architectuur MVP

De MVP is een clientside webapp waarmee één speler D&D 5e (2014) speelt met een zelf gekozen
cloud-LLM als DM. Alles draait in de browser, zonder server en zonder account.

## Besluiten

| Onderwerp      | Besluit                                                           | Reden                                                        |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Spelers        | Solo, één speler per campagne                                     | Houdt synchronisatie en accounts buiten de MVP               |
| Hosting        | Volledig clientside, statische build                              | De gebruiker hoeft niets te hosten of op te zetten           |
| Opslag         | IndexedDB in de browser, export en import als bestand             | Laagdrempelig, de data blijft bij de speler                  |
| Providers      | Cloud-API's: OpenRouter, Anthropic, OpenAI, Google                | Aanroepen vanuit de browser zijn per provider haalbaar       |
| Systeem        | Alleen D&D 5e (2014), engine als losse module                     | Kleine eerste versie, andere systemen kunnen later volgen    |
| Worpen         | De speler rolt altijd zelf, de engine rolt voor vijanden en NPC's | Het model kan geen uitkomsten verzinnen of herrollen         |
| Avonturen      | Markdown, eenmalig opgedeeld in beats                             | Spoilerbeheer per beat, pdf-avonturen volgen later           |
| Kaarten        | DM-kaart alleen naar het model, bij de start van een beat         | Het model heeft een visuele referentie nodig                 |
| Personage      | Pdf-import met controle door de speler                            | Geen character-builder, geen concurrent van D&D Beyond       |
| DM-instructies | Vaste kern plus bewerkbaar protocol per campagne                  | De mechaniek blijft intact en de stijl is aanpasbaar         |
| Geheugen       | Sessielog automatisch, protocolwijzigingen na akkoord             | Het spel loopt door, de speler houdt de regie over de regels |
| API-key        | In IndexedDB, versleuteling optioneel, nooit in een export        | Laagdrempelig voor de MVP                                    |
| Stack          | TypeScript, React, Vite, Dexie, pdf.js, Zod                       | Lage drempel voor bijdragers, past bij een statische build   |
| Interface      | Chat plus zijpaneel, geen combat-tracker                          | MVP-omvang                                                   |
| Werkwijze      | TDD, vijf modelscenario's in de repo                              | Het model moet de DM-rol aankunnen                           |

## Modules

- **Interface:** chat en zijpaneel voor campagnebeheer.
- **Orchestrator:** voert elke beurt uit, roept de engine aan, leest en schrijft de opslag.
- **Regelengine 5e:** pure TypeScript in `src/engine/`, bepaalt elke uitkomst met een getal.
- **Context-bouwer:** stelt de prompt samen uit kern, protocol, personage, beat, kaart en log.
- **Opslag:** IndexedDB via Dexie.
- **Provider-laag:** één intern tool-formaat voor OpenRouter, Anthropic, OpenAI en Google.
- **Importers:** avontuur (markdown) en personage (pdf).

## Stroom per beurt

1. De speler schrijft een actie en meldt zijn eigen worpen.
2. De context-bouwer stelt de prompt samen.
3. Het model kiest een tool of schrijft narratie.
4. Bij een tool voert de engine de worp of statuswijziging uit en geeft het resultaat terug.
5. Het model schrijft de narratie, die in de chat verschijnt, en de volgende beurt begint.

## Regelengine

De engine is een pure module die elke uitkomst met een getal bepaalt. Het model ziet de uitkomst
pas nadat de engine hem heeft gerold. De speler beheert zijn eigen HP en resources, de app volgt
alleen vijanden en NPC's.

Tools: worpen voor vijanden en NPC's, vijanden en NPC's aanmaken, initiative bijhouden, HP,
conditions en recharge bijwerken.

## Avonturen en kaarten

Een avontuur komt als markdown en wordt bij de import eenmalig door het model opgedeeld in beats
met ruimtes, NPC's, encounters en uitgangen (JSON). Tijdens het spel krijgt de DM alleen de bron
van de huidige beat. Het model ontvangt de DM-kaart bij de start van een beat. De speler ziet
geen kaart.

## Personage-import

pdf.js leest de formuliervelden (MPMB levert een invulbare pdf) en valt terug op tekstextractie.
Het model zet het resultaat om in een character-markdown, de speler controleert die eenmaal en
bevestigt. De app bouwt geen personages.

## DM-instructies en geheugen

- Vaste kern: tool-gebruik, spoilerbeheer per beat en de regel dat de speler zelf rolt.
- Protocol per campagne: bewerkbaar markdown-bestand met houserules en stijl.
- Sessielog: automatisch bijgewerkt aan het einde van een sessie, met een recap bij de start.
- Lange sessies: oudere beurten worden samengevat, de engine-state blijft buiten de chat.

## Testplan

TDD. Unit-tests voor de engine met een seeded rng, tests voor import en provider-laag met
gemockte responses, en vijf modelscenario's die tegen elk gekoppeld model te draaien zijn:
spoilertest, worptest, speler-agency, positie vasthouden en tool-formaat.

## Latere versies en open punten

- Latere versies: lokale modellen (Ollama, LM Studio), pdf-import van avonturen, andere systemen.
- Open: naam van het project, bron van statblocks en spelregeldata (SRD en de licentie ervan),
  of D&D Beyond-pdf's invulbare formuliervelden bevatten.
