# Familjetavla – designsystem 2026

Det här dokumentet beskriver hur tavlan ser ut och beter sig, och varför. Det är skrivet så att en annan
människa eller AI ska kunna granska designen, föreslå ändringar och bygga nya kort som passar in.
Koden finns i `web/src/styles.css`, `web/src/dashboard/*` och `web/src/dashboard/bits.tsx`.

## 1. Utgångspunkt

Tavlan hänger på väggen eller står i köket på en iPad Pro (1366 × 1024, liggande). Den läses oftast
**på 2–3 meters avstånd, i förbifarten, med en halv sekunds uppmärksamhet**. Därför:

1. **En sak först.** Det viktigaste just nu (”Om 45 min: Middag”) ska gå att läsa från andra sidan rummet.
2. **Lugn yta.** Ingen blinkande UI. Rörelse bara när något ändras eller när någon rör skärmen.
3. **Barnen ska förstå den.** Ikoner och färg per person – man behöver inte kunna läsa för att se ”min träning”.
4. **Mjuk men tydlig.** Glas, ljus och djup – men alltid med text som har minst 4.5:1 kontrast.
5. **Den lever med dygnet.** Bakgrunden följer tid och väder så tavlan känns som ett fönster, inte en skärm.

## 2. Material – ”Liquid Glass”

Alla kort (`.card`) är halvgenomskinligt glas som ligger ovanpå en levande himmel.

| Egenskap | Värde | Varför |
|---|---|---|
| Bakgrund | `var(--glass)` – vit 55 % (ljust) / 8 % (mörkt) | Himlen syns igenom, men text bärs av en stabil yta |
| Oskärpa | `backdrop-filter: blur(28px) saturate(170%)` | Frostat glas; mättnaden gör att färgen från himlen ”glöder” |
| Kant | 1 px `var(--glass-edge)` + inre highlight `inset 0 1px 0` | Ger glaskanten ljus från ovan |
| Spegling | `::before` med linjär gradient i övre kanten | Specular highlight – materialet känns fysiskt |
| Hörn | 28 px (kort), 18 px (rader), 999 px (piller) | Konsekvent ”squircle”-känsla |
| Skugga | Mjuk, stor, låg opacitet | Lyfter kortet utan att smutsa ner |

Fallback: utan `backdrop-filter` (äldre webbläsare) blir glaset nästan ogenomskinligt så text alltid går att läsa.
Med `prefers-reduced-transparency` kan oskärpan stängas av helt.

## 3. Levande bakgrund

`<div class="sky">` med tre stora, suddiga färgblobbar (`<i>`) som långsamt driver (60–90 s per varv).

**Dygnsfaser** (`html[data-phase]`, räknas ut på servern från klockan, i demon från webbläsarens klocka):

| Fas | Tid | Känsla | Tema |
|---|---|---|---|
| `dawn` | 05–08 | Persika, rosa, blekblå | Ljust |
| `day` | 08–17:30 | Klarblå, turkos, vitt | Ljust |
| `dusk` | 17:30–21 | Plommon, korall, indigo | Mörkt |
| `night` | 21–05 | Djupblå, violett, nästan svart | Mörkt |

Med tema ”auto” byter tavlan själv mellan ljust och mörkt efter fasen. Användaren kan låsa tema i Inställningar → Visning.

**Väder** (`html[data-sky]` = `clear | cloudy | rain | snow | fog`, från Open-Meteo) lägger ett tunt lager ovanpå:
diagonala regnstreck, fallande snöprickar eller en dimslöja. Molnigt sänker mättnaden på blobbarna.

## 4. Typografi

| Roll | Typsnitt | Användning |
|---|---|---|
| Display | **Bricolage Grotesque** (variabel: `wdth` 75–100, `opsz`, `wght` 400–800) | Klocka, rubriker, siffror |
| Text | **Manrope** 400–800 | Allt annat |

Siffror (klocka, temperatur, elpris, batteri) sätts **smalt** (`font-stretch: 75%`) och med
`font-variant-numeric: tabular-nums` – stora men inte breda, och de hoppar inte i sidled när de ändras.

Skala (iPad): klocka 104 px · Nu-rubrik 44 px · temperatur 88 px · kortrubrik 22 px · brödtext 17 px · etikett 12 px versaler +0.08em.
Allt skalar ned med `clamp()` på mindre skärmar. Rubriker har `text-wrap: balance`.

Typsnitten laddas från Google Fonts med systemtypsnitt som reserv – tavlan fungerar även offline.

## 5. Layout – Nu-zon + bento

```
┌──────────── Nu-zon (2 kolumner) ───────────┐ ┌─ sida ─┐
│ NU  Om 45 min                       13° ☂ │ │ Elpris │
│ ▸ 18:00 Middag: tacos               Regn  │ │ Bilar  │
│   07:45 Lämna Ella och Leo     (Em)       │ │ Ljus   │
│   17:30 F14 – Träning          (El)       │ │        │
└───────────────────────────────────────────┘ │        │
┌─ vänster ─┐ ┌────── Kommande 7 dagar ─────┐ │        │
│ Kom ihåg  │ │ Idag      (stor rad)         │ │        │
│ Barnvecka │ │ Imorgon   (stor rad)         │ │        │
│ Inköp     │ │ Tis … Lör (kompakta rader)   │ │        │
└───────────┘ └──────────────────────────────┘ └────────┘
```

* `grid-template-areas: "now now side" "left week side"` på iPad, en kolumn på telefon.
* **Nu-zonen** visar de nästa tre tidsatta händelserna fram till slutet av imorgon, med en rubrik som räknas ut
  (”Om 45 min”, ”Om 1 h 30 min”, ”Pågår: …”, ”Imorgon kl 07:45”) och vädret just nu i stort format.
  Barnens skolschema tas inte med (bara idrott, så att man kommer ihåg gympapåsen).
* **Idag och Imorgon** får dubbel höjd i veckan; resten av veckan är kompakt.
* **Vad som visas och i vilken ordning** väljs i Inställningar → Visning → Startskärm. Korten fördelas jämnt mellan
  vänster- och sidokolumnen i den ordning användaren valt. Nu-zonen kan stängas av.

## 6. Personer och aktiviteter

* **Avatar** (`<Avatar>`): färgad cirkel med initial. Om två personer börjar på samma bokstav används två bokstäver
  (Em / El). Den som inte är hemma (barnet på andra veckan) visas nedtonad i sidhuvudet.
* **Aktivitetsikon** (`<EventIcon>`): väljs automatiskt från titel + kalendernamn – fotboll/match → boll,
  simning → vågor, musik/piano → not, kalas/födelsedag → tårta, tandläkare/läkare → hjärta, resa/flyg → plan,
  sopor → tunna, mat/middag → bestick, skola → mössa, idrott/gympa → puls, övrigt → klocka.
  Reglerna finns i `ICON_RULES` i `server/src/dashboard.ts` och är lätta att utöka.
* Händelser är **piller** med ikon, tid i fet smal siffra, titel och personens avatar.

## 7. Färg

Accent `#34e0a1` (mint) – kan ändras i Visning. Personfärger väljs per person. Statusfärger:
grön (billigt / klart), gul (påminnelse / pågår), röd (dyrt / fel), blå (info / länkar).
Alla färger är tokens på `:root` med mörka värden först och ljusa under `[data-theme="light"]`.
Elprisstaplar: billigaste timmarna gröna, nuvarande timme röd/markerad, resten neutrala.

## 8. Rörelse

| Vad | Hur |
|---|---|
| Fjäder | `cubic-bezier(0.34, 1.56, 0.64, 1)` 380 ms – knappar, kort och ark ”studsar” lätt när de dyker upp |
| Tryck | Allt tryckbart krymper till 97 % under fingret |
| Rullande siffror | `<AnimatedNumber>` – elpris, batteri och temperatur rullar fram till nytt värde |
| Flikbyte | View Transitions API – flikarna glider/tonar in i stället för att hoppa |
| Himmel | Blobbarna driver långsamt; regn/snö faller |

`prefers-reduced-motion: reduce` stänger av allt detta (bara direkta byten, ingen drift, inget regn).

## 9. Gester

* **Svep vänster/höger** mellan flikarna Hem, Bil, Ljus, Hus, Energi, Grafer.
* **Dra nedåt** från toppen för att uppdatera (pull to refresh) – ikonen snurrar medan data hämtas.
* **Tryck på en händelse** → ark med tid, plats, person och vilken kalender den kommer från.
* Alla träffytor är minst 44 × 44 px; knappar i bottenmenyn 64 px höga.

## 10. Viloläge – fotoram

Efter `idleMinutes` (standard 10, ställs in under Visning) utan beröring tonar tavlan över till en fotoram:
familjens bilder (laddas upp under Visning → Fotoram, skalas ned i webbläsaren innan uppladdning) visas i ett
långsamt bildspel med Ken Burns-zoom. Utan bilder visas den levande himlen. Nere i hörnen: stor klocka, datum,
nästa händelse och temperatur. Ett tryck var som helst väcker tavlan. Nattläget (t.ex. 22–06) dimmar dessutom allt.

## 11. Förhandsvisa som iPad på en annan skärm

`#ipad` i adressen (eller knappen **Visa som iPad** i demon) visar tavlan exakt som på en iPad Pro 12,9″ liggande
– 1366 × 1024 – nedskalad för att passa skärmen. Tavlan körs i en iframe så att dess layout verkligen ”tror” att
fönstret är 1366 px brett. På en Android-telefon: vrid till liggande läge och tryck **Helskärm** (låser även
liggande läge där webbläsaren tillåter det).

## 12. Tillgänglighet

* Kontrast minst 4.5:1 för text, 3:1 för ikoner – även på glas (glaset blir tätare vid ljusa himlar).
* Alla ikonknappar har `aria-label`; händelser har en uppläsbar etikett (”Imorgon 17:30, F14 – Träning, Ella”).
* Färg bär aldrig ensam betydelse: personer har även initial, prisstaplar även text (”Billigast 00–04”).
* Fungerar med Dynamisk text/zoom upp till 200 % utan horisontell scroll.

## 13. Bygga ett nytt kort

1. Lägg till id i `HOME_WIDGETS` (`server/src/types.ts`) och data i `buildDashboard`.
2. Rendera som `<section className="card">` med `<h2>` och använd tokens (`--fg`, `--muted`, `--accent` …), aldrig hårdkodade färger.
3. Siffror: `<AnimatedNumber>` + klassen `num`. Händelser: `<EventIcon>` + `<Avatar>`.
4. Lägg till en etikett i `WIDGET_LABELS` (`web/src/setup/steps.tsx`) så det går att slå på/av under Visning.

## 14. Öppna frågor för granskning

* Ska Nu-zonen kunna visa annat än kalendern (t.ex. ”Diskmaskinen klar”, ”Bilen laddad 07:00”)?
* Behövs ett ”kiosk”-läge med ännu större text för den som har tavlan långt bort?
* Ska fotoramen kunna hämta bilder direkt från Google Foto / Immich via Home Assistant?
