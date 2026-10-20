# Bidra till Familjetavla · Contributing

*English below.*

Familjetavla byggs tillsammans. Ingen enskild person har alla skolplattformar, renhållare,
växelriktare och bilar, så varje bidrag gör tavlan bättre för fler familjer.

## Utan att koda

- **Berätta vad du har.** Öppna ett [ärende](../../issues/new/choose): vilken skolplattform,
  renhållare, butik, elmätare eller växelriktare ni har, och hur guiden hanterade ert hem.
- **Testa nya kopplingar** i ert eget hem och säg om det fungerar.
- **Skriv aldrig lösenord, tokens eller kalenderlänkar i ett ärende.** De är offentliga.
  Skriv i stället att du kan testa, så tar vi det privat.

## Med kod

Allt är moduler. Du lägger till en fil och listar den på ett ställe, resten av tavlan behöver
du inte röra.

| Vad | Var | Mall |
|---|---|---|
| **Datakälla**: skolplattform, renhållare, butik, elpris | `server/src/providers/` | [`example.ts`](server/src/providers/example.ts) |
| **Ruta** på startsidan | `web/src/widgets/` | [`_example.tsx`](web/src/widgets/_example.tsx) och [README](web/src/widgets/README.md) |

### En ny datakälla

1. Kopiera `server/src/providers/example.ts` och döp om den.
2. Fyll i `meta`: namn, beskrivning och vilka fält användaren fyller i. Guiden ritar formuläret
   och **Testa**-knappen själv. Fält med `secret: true` sparas krypterat.
3. Skriv `test` (körs när man trycker Testa) och `fetch` (körs av tavlan).
4. Lägg till den i `PROVIDERS` i `server/src/providers/registry.ts`.
5. Skriv ett test med ett sparat svar från tjänsten (inga riktiga konton i testerna), se
   t.ex. `server/src/srv.test.ts`.
6. Börja med `status: "experimental"`. Den blir `beta` när någon har provat den hemma.

### En ny ruta

Se [web/src/widgets/README.md](web/src/widgets/README.md).

### Innan du skickar en pull request

```bash
npm install
npm test                                   # servertester
npm run typecheck                          # typkoll
npm run build:demo -w web && node e2e/devices.mjs   # enhetskollen: alla skärmar, ljust/mörkt/e-ink
```

Enhetskollen provar varje sida på iPad, Android-platta, telefon och e-ink och säger till om
något inte får plats, ligger bakom något annat eller scrollar på en platta. Den ska ge 0 fel.

Texterna på tavlan är på svenska, koden och kommentarerna på engelska.

---

## Contributing (English)

Familjetavla is built together. Nobody has every school platform, waste service, inverter and
car, so every contribution makes the board work for more families.

**Without code:** [open an issue](../../issues/new/choose) and tell us what you have (school
platform, waste service, store, meter, inverter) and how the setup guide handled your home.
**Never post passwords, tokens or calendar links in an issue** – issues are public. Say you can
test, and we take it privately.

**With code:** everything is a module. Add one file and list it in one place.

| What | Where | Template |
|---|---|---|
| **Data source**: school platform, waste service, store, electricity price | `server/src/providers/` | [`example.ts`](server/src/providers/example.ts) |
| **Card** on the home screen | `web/src/widgets/` | [`_example.tsx`](web/src/widgets/_example.tsx) and [README](web/src/widgets/README.md) |

A data source has a `meta` (name, fields – the setup guide draws the form and the *Testa* button
from it, `secret: true` fields are stored encrypted), a `test` and a `fetch`. Register it in
`PROVIDERS` in `registry.ts`, add a test with a saved response (no real accounts in tests), and
start as `status: "experimental"`.

Before a pull request: `npm test`, `npm run typecheck`, and the device check
`npm run build:demo -w web && node e2e/devices.mjs` (every page on iPad, Android tablet, phone
and e-ink – it must report 0 errors). UI text is Swedish; code and comments are English.
