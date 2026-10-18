# Familjetavla – underlag för extern granskning

> **Till dig som granskar (människa eller AI):** Läs hela filen och svara sedan enligt *Så vill vi ha svaret* längst ner.
> Var konkret och kritisk. "Det här ser bra ut" hjälper oss inte, men "det här går sönder när …" gör det.
> Status 2026-10-18, version 0.1.0. Repo (publikt, MIT): https://github.com/murre87/familjetavla

Mer detaljer finns om du behöver dem:
- Projektbeskrivning: https://github.com/murre87/familjetavla/blob/main/docs/PROJEKT.md
- Designsystem: https://github.com/murre87/familjetavla/blob/main/docs/DESIGN.md
- Klickbar demo (en HTML-fil, låtsasdata): https://github.com/murre87/familjetavla/blob/main/docs/demo/familjetavla-demo.html

---

## 1. Vad det är, på en minut

En **familjetavla för en surfplatta i hallen eller köket**, som en iPad på väggen. Den visar det en svensk barnfamilj behöver se idag och i veckan:

- **Nu-zonen:** det som händer härnäst, läsbart på 2–3 meters avstånd.
- **Kom ihåg:** till exempel "Regn i eftermiddag – ta regnjackan", "Idrott imorgon – gympapåse", "Matavfall hämtas imorgon", "Leo · 07:30–16:00 (omsorgstid idag)".
- **Kommande 7 dagar** med en färg per person.
- **Barn:** skola och förskola (Vklass eller en kalenderlänk), matsedel, barnens sport (SportAdmin, laget.se) och vem som skjutsar dit och hem.
- **Barnvecka** för den som har växelvis boende. Den här modulen syns bara om något barn bor växelvis.
- **Hemmet via Home Assistant:** bilar, ljus, värme, spabad, solel och elpris.
- **Inköpslista** som kan skickas till Willys eller Hemköp.

Tavlan körs lokalt (Node + React). Den installeras som tillägg i Home Assistant OS, eller som Docker-container bredvid Home Assistant. En visuell guide i 11 steg sköter inställningarna, utan YAML.

## 2. Familjer vi måste klara, inte bara vår egen

Grundprincipen är att **ingen familjeform är standard**. En tidig version utgick för mycket från varannan vecka, eftersom utvecklaren själv har det. Det är rättat (se avsnitt 4), och vi vill att du kontrollerar att det verkligen håller.

| Typ | Exempel | Hur tavlan hanterar det |
|---|---|---|
| Alla barn bor här hela tiden | Kärnfamilj | Standardval för nya barn ("Hela tiden"). Ingen barnvecka, inga bytespåminnelser och ingen byteskalender visas. |
| Varannan vecka | Bonusfamilj, delad vårdnad | "Växelvis – varannan vecka" från ett datum, med valfri bytesdag. Klarar vecka 53. |
| Udda eller jämna veckor | | Finns. Användaren varnas för att 2026 har två udda veckor i rad (v53 + v1). |
| **Blandat i samma hushåll** | **Vår egen familj: 2 barn varannan vecka + 2 barn på heltid** | Inställt per barn. Barnveckan räknar bara de växelvisa barnen, och heltidsbarnens aktiviteter visas alltid. |
| Avvikelser | Lov, bytt helg, klämdag | Undantag per barn (från–till, hemma/borta), eller en delad byteskalender. |
| **Inte stöd ännu** | 2-2-3-schema, 2-2-5-5, varannan helg, olika rytm sommar/vinter | Bara som manuella undantag. Se fråga 2. |

### Vår egen familj (testfallet)

- 2 vuxna.
- 2 barn varannan vecka, byte på måndag. Sport via SportAdmin och laget.se, som bara ska visas på barnveckorna (matcher alla veckor).
- 2 barn på heltid. Ett av dem går på **förskola som använder Vklass**: omsorgstid och **matsedel** finns där.
- Home Assistant körs i **Docker (Container)**, inte HA OS. Därför installeras tavlan som en egen container, och Home Assistant ansluts med adress + långlivad token.

## 3. Hur barn och förskola fungerar tekniskt

- **Person:** `{ name, color, kind: "adult" | "child", custody? }`. För barn: `custody.mode = "always" | "alternating" | "oddWeeks" | "evenWeeks"` plus `handoverDay`, `anchorDate` och `overrides[]`.
- **Synlighet:** ett barns kalendrar (sport, skola) visas bara de dagar barnet är här. För "always" betyder det alltid. Per kalender kan man välja "visa alla veckor" eller ange ord som alltid ska visas, till exempel "match".
- **Vklass** (inofficiellt, skrapar vårdnadshavarwebben med användarnamn och lösenord – BankID går inte):
  - Hittar alla barn på kontot, både skola och förskola.
  - Läser **kalender** per barn, **matsedel** från startsidan och **omsorgstid** (förskola/fritids) från startsidan. Omsorgstiden visas i Kom ihåg under dagen, bara för barn som är hemma.
  - Idrottslektioner ger "ta gympapåsen".
- **Matsedel** kan också hämtas från Skolmaten.se eller via Skolmat-integrationen i Home Assistant (Mashie, Matilda, FoodIT m.fl.).
- Skollektioner döljs i veckovyn, eftersom det blir för mycket brus. Idrott och heldagshändelser visas.

## 4. Ändrat i den här omgången (2026-10-18)

**Familjeform**
- Valet heter nu "Bor här: **Hela tiden** / Växelvis – varannan vecka / Växelvis – udda veckor / Växelvis – jämna veckor". Etiketten "(rekommenderas)" på varannan vecka är borttagen.
- Guidens texter utgår inte längre från växelvis boende. Barnveckeinställningar visas bara när något barn bor växelvis.
- Steget heter "Skola och förskola" och nämner omsorgstid och matsedel.
- Nytt: **omsorgstid från Vklass** i Kom ihåg (testat).

**Egenkontroll av koden**
- Sårbara beroenden uppgraderade (`@fastify/static` → 10.1.6, `uuid` → 11.1.1). `npm audit`: 0.
- Varje sparning av inställningar öppnade en extra WebSocket mot Home Assistant. Rättat.
- Ett schema (till exempel värmestart) kunde köras två gånger samma minut. Rättat.

**Design och installation**
- Startskärmen ryms på en iPad-skärm utan att man behöver skrolla. Kolumner med för mycket innehåll skrollar var för sig.
- Guiden visar "Steg X av 11", markerar valfria steg ("Hoppa över") och söker i Home Assistant direkt. Valen kan inte längre försvinna om man trycker Nästa.
- Knappen "Lägg till i Home Assistant" i README, och instruktioner för Docker.

**Tester:** 40 automatiska tester (vitest). Bland annat barnvecka med v53 och fredagsbyte, sommartid i kalendrar, elpris, skjuts, och ett nytt test för heltidsbarn med omsorgstid.

## 4b. Ändrat efter första granskningen (version 0.2.0)

- **Förskola/fritids** per barn: omsorgstider per veckodag i guiden (reserv när Vklass inte går – i Jönköping fungerar Vklass med lösenord), dagens tider från Vklass när de finns, **Lämning/Hämtning i Nu-zonen** och "Emil lämnar · Anna hämtar" med samma väljare som sportens skjuts (standard per barn, ändras per dag).
- **Stängda dagar:** heldags- eller skolhändelser med "stängt", "planeringsdag", "studiedag", "APT" … ger en varning i Kom ihåg **upp till 7 dagar i förväg**, och omsorgen den dagen visas inte.
- **Eget 14-dagarsschema** (kryssa i dagar för vecka A och B) med färdiga mallar: 2-2-3, 2-2-5-5, varannan helg, alla dagar utom varannan helg, varannan vecka. Knappen "Vänd" byter perspektiv.
- **"Hos oss"** (tidigare "Barnvecka"): en rad per grupp när barnen har olika rytm; "byter hem" i stället för "åker".
- **Matcher alla veckor** är ett eget, synligt val på barnets kalender (förvalt för sport).
- **Skärmar låses upp med PIN en gång** (HttpOnly-cookie, bara hash sparas). Utan upplåsning svarar API:t 401 – även vardagsknapparna. Skärmen som sätter PIN låses upp direkt; "Glöm alla upplåsta skärmar" finns.
- **Skjutsval** sparas på kalender + UID + datum, så de överlever att träningen flyttas 15 minuter.
- Vklass-barn **kopplas automatiskt** på förnamn.

Inte gjort ännu: bytestid (morgon/eftermiddag på bytesdagen), dygnsfaser från solens upp- och nedgång, temperaturbaserade klädtips, veckans middagar bredvid skollunchen.

## 5. Kända svagheter (vi vet om dem)

- Vklass, Willys och EDP (sopor) är **inofficiella** och kan sluta fungera, eller strida mot sajternas villkor. Vklass-flödet är inte verifierat mot ett riktigt förskolekonto ännu.
- Var omsorgstiden ligger och hur den är formaterad på Vklass startsida är antaget utifrån communityns skrapare. Om förskolan inte visar den där syns inget, och inget går sönder.
- Utan PIN är tavlan fortfarande öppen för hela hemnätet (guiden rekommenderar PIN i Docker-läge).
- Ingen inloggning per person. Alla som ser tavlan ser allt.

## 6. Frågor vi vill ha svar på

1. **Familjeformer:** Utgår något fortfarande från varannan vecka eller kärnfamilj? Leta i texter, standardval, påminnelser och vad som syns när inget barn bor växelvis.
2. **Scheman:** Vilka växelvisa scheman är vanliga i Sverige (2-2-3, 2-2-5-5, varannan helg, 10-4 …)? Vilka ska vi stödja som egna val, och vilka räcker som undantag?
3. **Flera växelvisa barn med olika rytm:** Hur bör startskärmen visa det? En rad per barn, eller "Ella kommer imorgon, Leo åker fredag"?
4. **Förskola:** Vad behöver en förskoleförälder se varje dag som vi saknar? Lämning och hämtning, vem som hämtar, ledighetsanmälan, frånvaro, "ta med extrakläder", planeringsdagar, stängt?
5. **Matsedel:** Räcker "dagens lunch" i Kom ihåg? Ska förskolans matsedel och middagsplanering samsas?
6. **Vklass:** Är det rimligt att skrapa Vklass med lösenord? Finns det ett bättre, officiellt sätt (ICS-export, API) för skola och förskola?
7. **Installation för Docker-användare:** Är adress + långlivad token rätt väg, eller borde tavlan också gå att installera som en HACS-integration med ett eget kort?
8. **Säkerhet:** Räcker PIN för inställningarna när tavlan kör i Docker på hemnätet? Vad är minsta rimliga skydd för knapparna?
9. **Vad ska bort?** Finns det funktioner som gör tavlan rörigare än den behöver vara för en vanlig familj?
10. **Viktigast härnäst:** Rangordna de tre saker som skulle göra mest nytta för en familj som vår.

## 7. Så vill vi ha svaret

Svara på svenska, i den här ordningen:

1. **Sammanfattning:** högst 5 meningar. Är vi på rätt väg?
2. **Fel och risker:** en tabell med kolumnerna *Allvar (hög/medel/låg) · Var · Problem · Förslag*.
3. **Svar på frågorna 1–10:** kort, numrerat.
4. **Topp 3 att göra härnäst:** med en mening var om varför.

Om du inte kan läsa koden eller demon: säg det, och basera svaret på det här dokumentet.
