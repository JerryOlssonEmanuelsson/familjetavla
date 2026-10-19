# Familjetavla – underlag för extern granskning

> **Till dig som granskar (människa eller AI):** Läs hela filen och svara sedan enligt *Så vill vi ha svaret* längst ner.
> Var konkret och kritisk. "Det här ser bra ut" hjälper oss inte, men "det här går sönder när …" gör det.
> **Status:** version 0.6.2, 2026-10-19. Hela dokumentet beskriver nuläget. Repo (publikt, MIT): https://github.com/murre87/familjetavla

Mer detaljer om du behöver dem: [PROJEKT.md](PROJEKT.md) (arkitektur), [DESIGN.md](DESIGN.md) (designsystem), och en klickbar demo med låtsasdata i `docs/demo/familjetavla-demo.html`.

---

## 1. Vad det är, på en minut

En **familjetavla för en surfplatta i hallen eller köket**, som även används från telefonen. Den hjälper familjen att **planera vem som gör vad**, inte bara att visa kalendern:

- **Nu-zonen:** det som händer härnäst, läsbart på 2–3 meters avstånd, till exempel "07:30 Lämning · Förskola – Emil lämnar · Anna hämtar".
- **Planera veckan:** allt de kommande 7 dagarna som behöver en vuxen (förskolans lämning och hämtning, skjuts till aktiviteter). Det som saknar ansvarig syns i gult.
- **Påminnelser till rätt telefon** via Home Assistant-appen: "Om 30 min: Hämta Maja på förskolan 16:00".
- **Veckans mat:** skol-/förskolelunch per barn bredvid familjens middag, varning vid samma rätt, varor till inköpslistan.
- **Kom ihåg:** regn, gympapåse, sopor, planeringsdag på förskolan (en vecka i förväg), och det som saknar ansvarig idag eller imorgon.
- **Kommande 7 dagar** med en färg per person.
- **Barn:** skola och förskola (Vklass, SchoolSoft eller kalenderlänk), matsedel, sport (SportAdmin, laget.se).
- **Hos oss:** syns bara om något barn bor växelvis. En rad per barn när barnen har olika rytm.
- **Tillval:** hemmet via Home Assistant (bil, ljus, värme, energi), sophämtning, inköpslista, elpris.

Tavlan körs lokalt (Node + React). Den installeras som tillägg i Home Assistant OS eller som Docker-container bredvid Home Assistant. **Guiden vid första start har 5 steg:** Hem, Familjen, Kalendrar, Skola och förskola, Klart. Allt annat läggs till från Klart-steget eller senare.

## 2. Familjer vi måste klara

**Ingen familjeform är standard.** Nya barn bor här "hela tiden" tills man väljer annat.

| Typ | Hur tavlan hanterar det |
|---|---|
| Alla barn bor här hela tiden | Standard. Ingen "Hos oss"-ruta, inga bytespåminnelser. |
| Varannan vecka | Från ett datum, med valfri bytesdag. Klarar vecka 53. |
| Udda eller jämna veckor | Finns, med varning för två udda veckor i rad (v53 + v1). |
| 2-2-3, 2-2-5-5, varannan helg … | Eget 14-dagarsschema med färdiga mallar och knappen "Vänd". |
| Blandat i samma hushåll | Inställt per barn. "Hos oss" visar en rad per grupp med samma rytm. |
| Avvikelser | Undantag per barn (från–till, hemma/borta) eller en delad byteskalender. |

**Medvetet avgränsat:** klockslag eller morgon/eftermiddag på bytesdagen. Större barn sköter övergången själva och kommer ibland på söndagen, ibland på måndagen. Dagsupplösning räcker.

### Vår egen familj (testfallet)

- 2 vuxna, Docker-installation bredvid Home Assistant (Container).
- 2 barn varannan vecka (byte måndag). Sport via SportAdmin och laget.se: matcher alla veckor, träningar bara när barnen är här.
- 2 barn på heltid, varav ett på **förskola i Jönköping med Vklass**, där lösenordsinloggning fungerar.

## 3. Hur det fungerar tekniskt

- **Person:** vuxen eller barn. Barn har `custody` (hela tiden, varannan vecka, udda/jämna, 14-dagarsmönster, undantag) och valfri `care` (förskola/fritids: tider per veckodag, vem som brukar lämna och hämta). Vuxna har valfri `notify` (telefon, minuter innan, kvällen innan, söndagsplanering).
- **Ansvar:** varje barnaktivitet och förskoledag har två ben, *dit/lämnar* och *hem/hämtar*. Varje ben har en vuxen, "blir skjutsad", buss eller cyklar/går. **Standard sätts per kalender** (i guiden eller med "Alltid så" i Planera veckan) och per barn för förskolan. Ett standardval räknas som planerat, så äldre barn som cyklar ger inga gula varningar. Val per gång sparas på kalender + UID + datum och överlever att träningen flyttas.
- **Påminnelser:** servern räknar ut varje vuxens ansvar och skickar via Home Assistants `notify.<telefon>`. Varje notis skickas en gång.
- **Kalenderlänk per vuxen (reserv):** privat ICS med VALARM. Fungerar i iPhone/Mac-kalendern på hemmanätet, och kan läggas in i Home Assistant med integrationen *Remote Calendar*. Fungerar inte i Google Kalender, som hämtar från internet.
- **Vklass** (inofficiellt, skrapar vårdnadshavarwebben med lösenord): barn, kalender, matsedel och omsorgstid från startsidan. Barn kopplas automatiskt om ett av Vklass-namnen ("Karl Leo Andersson") är exakt barnets namn på tavlan ("Leo") och bara ett barn matchar, annars väljer man i en lista.
- **Veckans mat:** matsedelsrader ("Måndag 19/10" eller bara "Måndag" från Vklass) placeras på rätt dag de kommande 7 dagarna; barn med samma meny slås ihop. Middagen skrivs in per dag och sparas lokalt. Varning om middagen delar ett ord (5+ bokstäver) med lunchen. "Att handla" lägger varor i inköpslistan.
- **Säkerhet:** med PIN låses varje skärm upp en gång (HttpOnly-cookie, bara hash sparas). Oupplåsta enheter får 401, även för vardagsknappar. Inställningar kräver alltid PIN.
- **Tester:** 58 automatiska tester. Bland annat barnvecka och v53, 14-dagarsmönster, sommartid, förskola och stängda dagar, plan och ansvar, notiser, ICS, skjutsnycklar, matsedelsdatum och samma-som-lunchen.

## 4. Ändringshistorik i korthet

- **0.1.0:** första versionen.
- **0.2.0:** ingen familjeform som standard, 14-dagarsmönster, "Hos oss", förskola med lämning och hämtning, stängda dagar, matcher alla veckor, upplåsning med PIN.
- **0.3.0:** Planera veckan, påminnelser till rätt telefon, guide med 5 steg.
- **0.3.1 (efter granskning 2):** standard för skjuts kan sättas i guiden per kalender och med "Alltid så" i Planera veckan, så att självgående barn inte ger varningar. Vklass-namn matchas på alla delnamn. Ärlig text om kalenderlänkens begränsningar. Det här dokumentet är omskrivet till ett enda nuläge.
- **0.4.0:** Veckans mat i Planera veckan.
- **0.5.0 (efter granskning 3):** matsedel utan datum låst till innevarande vecka (veckonummer används när det finns), stopplista för tillbehör i "samma som lunchen", APT = tidig stängning, ingen morgonnotis för den vanliga lämningen. Nytt: krockar med vuxnas egna kalendrar i Planera veckan, middagsfavoriter, "saknas på hyllan", återkommande anteckning per veckodag.
- **0.5.1:** Docker-imagen startade inte (saknat paket); CI bygger och startar nu imagen.
- **0.6.0:** SchoolSoft med lösenord (kalender och matsedel), beta.

## 5. Kända svagheter

- **Vklass, SchoolSoft, Willys/Hemköp och EDP (sopor) är inofficiella** och kan sluta fungera. Willys och Hemköp är märkta beta/experimentell och dyker bara upp om man väljer dem.
- **Vklass omsorgstid och matsedel** är byggda efter communityns skrapare, inte verifierade mot ett riktigt förskolekonto. Om inget hittas används veckoschemat i guiden.
- **Kalenderlänken** når bara telefoner på hemmanätet. Notiser via Home Assistant-appen är huvudspåret.
- Utan PIN är tavlan öppen för hela hemnätet. Guiden rekommenderar PIN.
- Ingen inloggning per person: alla som ser tavlan ser allt.

## 6. Frågor vi vill ha svar på

1. Är **Planera veckan** rätt verktyg för söndagskvällen, eller saknas något för att det ska bli en vana?
2. **Veckans mat** finns nu (lunch bredvid middag, varning vid samma rätt). Hjälper det, eller saknas t.ex. recept/favoriter?
3. Är **notiserna** lagom: 30 min innan, kvällen innan kl 20, söndag kl 19? Är något brus?
4. Förskolan: räcker lämning/hämtning, stängda dagar och matsedel, eller saknas något dagligt (utflykt, "ta med extrakläder")?
5. Finns det fortfarande ställen som utgår från en viss familjeform?
6. Vad är viktigast att bygga härnäst för en familj som vår?

## 7. Så vill vi ha svaret

Svara på svenska, i den här ordningen:

1. **Sammanfattning:** högst 5 meningar.
2. **Fel och risker:** en tabell med kolumnerna *Allvar (hög/medel/låg) · Var · Problem · Förslag*.
3. **Svar på frågorna 1–6:** kort, numrerat.
4. **Topp 3 att göra härnäst:** med en mening var om varför.

Om du inte kan läsa koden eller demon: säg det, och basera svaret på det här dokumentet.
