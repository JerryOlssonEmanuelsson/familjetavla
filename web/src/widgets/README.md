# Rutor (widgets)

Varje ruta på startsidan är en egen modul i den här mappen. Tavlan lägger ut rutorna själv
utifrån hur mycket de har att visa, och hoppar över en ruta som inte har något.

## En modul

```tsx
import type { WidgetModule } from "./types";

const widget: WidgetModule = {
  id: "energy",                 // samma id som i HOME_WIDGETS (server/src/types.ts)
  label: "Energi",              // namnet under Startskärm i inställningarna
  size: (data) => (data.energy ? 2 : 0),          // ungefärlig höjd i rader, 0 = visa inte
  render: ({ data }) => <EnergyMini e={data.energy} />,
  opens: { tab: "energy" },     // vad ett tryck på rutan öppnar (sida eller flik)
};
export default widget;
```

`render` får `{ data, actions, full }`:

- `data` – allt tavlan vet (typen `Dashboard` i server/src/types.ts)
- `actions` – tänd/släck, öppna sidor, visa meddelanden m.m.
- `full` – sant på sidan "Alla kort", där listor visas i sin helhet

## Lägga till en ruta

1. Lägg till id:t i `HOME_WIDGETS` i `server/src/types.ts` (då går den att välja under Startskärm).
2. Behöver rutan ny data: lägg den i `Dashboard` (server/src/types.ts) och fyll i den i
   `server/src/dashboard.ts`. Data från Home Assistant läses där.
3. Skapa `web/src/widgets/<id>.tsx` som ovan och lägg till den i `WIDGETS` i `index.ts`.
4. Lägg till den i demon (`web/src/demo/demoApi.ts`) och kör enhetskollen:
   `npm run build:demo -w web && node e2e/devices.mjs` – den provar rutan på alla skärmar.

Datakällor (skolplattformar, renhållare, butiker, elpris) är också moduler: se
`server/src/providers/` och kommentaren i `registry.ts`.
