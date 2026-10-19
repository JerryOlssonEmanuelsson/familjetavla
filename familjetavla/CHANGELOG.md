# Ändringar

## 0.8.0

- **Tryck på ett kort** så öppnas dess egen sida: Maten → veckans mat, Skolan → skolsidan, Kom ihåg, Inköpslista och Hos oss (kommande fyra veckor). Elpris, bil, ljus och värme går till sina flikar. Knappar och kryssrutor i korten fungerar som vanligt.
- **Tillbaka och Hem** överst på alla sidor och flikar. Androids bakåtknapp och webbläsarens bakåt fungerar också.
- **Skolsidan** per barn: dagens hela schema (tid, ämne, sal), läxor, prov och inlämningar de kommande två veckorna, och veckan måndag–fredag.
- **Ny version finns**: tavlan säger till när en nyare version är publicerad och hur man uppdaterar (tillägg eller Docker). Kollar GitHub var sjätte timme i bakgrunden; stängs av med `UPDATE_CHECK=off`.
- **Installera som app**: knapp på tavlan och i guidens sista steg – installerar direkt där webbläsaren tillåter det, annars stegen för iPad, Android eller dator, och tips om kioskapp för väggplattan.
- **Ingen scroll på surfplattor** (iPad och Android, liggande och stående): startsidan, sidorna och flikarna ryms alltid på skärmen. Innehållet krymper lite vid behov, men aldrig under läsbar storlek; det som inte ryms ligger bakom en knapp, t.ex. "+3 dagar – visa hela veckan" eller "+2 kort till". Liggande surfplatta får flikarna i en list till vänster så att tavlan får hela höjden. Mobilen scrollar som vanligt.
- Startsidan visar sammanfattningar – Kom ihåg de 4 viktigaste, inköpslistan de 5 första, veckan 3 händelser per dag – och sidan bakom kortet visar allt.
- **Prova i molnet**: knappen "Öppna i GitHub Codespaces" startar tavlan hos GitHub utan egen server, för att prova med Vklass och kalendrar.
- **Självkontroll på alla skärmar** vid varje ändring: iPad liggande/stående, iPad mini, Android-platta liggande/stående, Android-mobil, iPhone, iPhone SE och iPhone liggande – 11 sidor var. Kontrollerar att inget hamnar bakom flikraden, att surfplattor inte scrollar, att inget sticker ut åt sidan och att inga fel uppstår.
- Självkontrollen granskar också text: ingen text bakom eller ovanpå annan, inget kapat, i både ljust och mörkt läge, guiden och rutorna medräknade.
- Rättat: **"String must contain at most 30 character(s)"** vid Hämta från Home Assistant. Långa namn från HA kortas nu i stället för att stoppa sparandet, och många givare eller rum ryms.
- Rättat: aktivitetsnamn kapades till några bokstäver på smala mobiler; datum kring sommartid/vintertid i skolschemat.

## 0.7.0

- Nytt kort: **Skolan idag** – när varje barn börjar och slutar ("Ella 08:10–14:30"), med Idrott-märke. Visar nästa skoldag när dagens är slut, och bara barn som bor hos er just då. Kommer från schemat i Vklass, SchoolSoft eller kalenderlänken; kvällsmöten räknas inte.
- Startskärm: välj **storlek** per ruta – Auto, Liten, Normal eller Stor. Auto gör rutorna större när ni visar få och mer kompakta när ni visar många.
- De rutor som ligger först i er ordning hamnar högst upp i högerkolumnen på iPad (och direkt under Nu på telefonen), så det viktigaste alltid syns.

## 0.6.2

- Nytt kort på startsidan: **Maten** – dagens skollunch per barn (efter kl 14 morgondagens, efter fredagslunchen måndagens) och kvällens middag, i stor text. Slås på av sig självt och hamnar först under Nu-rutan; flyttas eller stängs av under Startskärm.
- Rättat: skolmat för t.ex. den 1:a kunde matcha "19/10".

## 0.6.1

- Skolsteget: "Saknas er skolplattform? Berätta vilken" – länk till ett färdigt formulär på GitHub (plattform, kommun, hur föräldrar loggar in, om du kan testa).

## 0.6.0

**Genomlysning efter att 0.5.0 inte startade**
- Tillägget och containern stängs nu av direkt vid stopp, omstart och uppdatering (tidigare hängde den tills den tvångsavslutades).
- Home Assistant startar om tillägget om det slutar svara (watchdog).
- En skadad inställningsfil sparas undan som `config.json.corrupt-…` i stället för att tyst skrivas över, och varje sparning behåller en `.bak`. Filer skrivs säkert till disk.
- Tidsgränser gäller nu hela hämtningen – en källa som slutar svara mitt i kan inte låta tavlan hänga.
- Ett bakgrundsfel kan inte längre stoppa hela tavlan.
- iPad liggande: högerkolumnen var tom och resten ihoptryckt – nu fördelas korten efter innehåll, och flikradens tomma plats används när det bara finns en flik.
- "Planera veckan" finns alltid, även för familjer utan förskola – det är också där veckans middagar planeras.
- Postnumret slås upp av sig självt och sparas även om uppslaget misslyckas.
- En tom rad (person eller kalender utan namn) låser inte längre guiden; felmeddelanden på svenska.
- PIN-koden måste vara 4–8 siffror. Ören med decimalkomma går att skriva på iPad. Elområde följer postnumret.
- Kom ihåg tjatar inte om en lämning som redan passerat.
- Visar "Ingen kontakt med tavlan just nu" när servern inte svarar, och ett meddelande när något inte gick att spara.
- Kalenderlänken från Påminnelser pekar på port 8099 när den skapas via Home Assistant.
- Svenska: "2 källor", "1 timme", "Fem korta steg".
- Ny: **SchoolSoft** med användarnamn och lösenord – kalender och matsedel, barnen kopplas som i Vklass. Beta.
- InfoMentor, Unikum m.fl.: guiden för kalenderlänk säger hur man får med matsedeln.

**Provas på riktigt före varje release:** GitHub bygger den riktiga imagen och en webbläsare går igenom guiden och tavlan – som Home Assistant-tillägg bakom ingress (med en låtsas-Supervisor), efter omstart, och som Docker med PIN och upplåsning av en ny skärm. Chromium startas i imagen och avstängningen tidtas. Releasen publiceras bara om allt går igenom.

## 0.5.1

- Rättat: Docker-imagen och tillägget startade inte ("Cannot find package '@fastify/static'"). Några serverpaket kom inte med i imagen.
- CI bygger och startar nu den riktiga imagen före varje release.

## 0.5.0

**Rättningar efter granskning 3**
- Matsedel utan datum ("Måndag" från Vklass) gäller bara innevarande vecka – hoppar aldrig fram till nästa. Veckonummer på matsedeln ("vecka 43") används när det finns.
- "Samma som lunchen" bryr sig inte om tillbehör som potatis, pasta och sallad.
- APT och "stänger 15:00" betyder tidig stängning: omsorgen ligger kvar och Kom ihåg säger "kolla när förskolan stänger". Bara heldags stängt/planeringsdag tar bort dagen.
- Ingen 30-minutersnotis för den vanliga morgonlämningen – bara när just den morgonen är ändrad. Kvällsnotisen skickas igen om planen ändras efter kl 20.

**Nytt**
- **Krockar i Planera veckan:** har en vuxen något i sin egen kalender vid lämning eller hämtning (eller resa/semester hela dagen) står det på knappen, t.ex. "Emil ⚠ – Kundmöte 16:00–17:15". Valda vuxna som är upptagna räknas som "att lösa".
- **Middagsfavoriter:** tryckbara favoriter som tavlan lär sig av era middagar, och "Som vanligt: tacoskal, ost" lägger samma varor i inköpslistan.
- **Saknas på hyllan:** markera blöjor, extrakläder, regnkläder … på förskolans lämning – det står i Kom ihåg tills ni bockar av.
- **Återkommande per veckodag** för förskolan, t.ex. "Tisdag: Utflykt – packa ryggsäck och frukt".

## 0.4.0

- **Veckans mat** i Planera veckan: barnens skol- och förskolelunch per dag bredvid familjens middag. Varnar när middagen är samma som lunchen, och "Att handla" lägger varorna i inköpslistan.
- Middagen syns i veckan på tavlan, och "Middag ikväll" i Kom ihåg på eftermiddagen.

## 0.3.1

- **Standard för skjuts i guiden** per kalender ("Ella brukar ta sig dit/hem: cyklar själv"), och knappen "Alltid så" i Planera veckan. Ett standardval räknas som planerat – självgående barn ger inga gula varningar.
- Vklass-barn kopplas på alla delnamn ("Karl Leo Andersson" → Leo) när det är entydigt.
- Kalenderlänken förklarar ärligt var den fungerar (iPhone/Mac på hemmanätet, Remote Calendar i Home Assistant – inte Google Kalender).

## 0.3.0

- **Planera veckan:** allt de kommande 7 dagarna som behöver någon som lämnar, hämtar eller skjutsar – med ett tryck per val. Det som saknar ansvarig syns i gult, och Kom ihåg säger till om det gäller idag eller imorgon.
- **Påminnelser till rätt telefon** via Home Assistant-appen: X minuter innan det man själv ansvarar för, kvällen innan kl 20 och "Planera veckan" söndag kl 19. Eller en egen kalenderlänk per vuxen att prenumerera på.
- **Kortare guide:** första gången bara Hem, Familjen, Kalendrar, Skola och förskola – sedan Klart. Hemmet (bil, ljus, värme), sopor, inköp, elpris och påminnelser läggs till från sista steget eller senare.

## 0.2.0

- **Ingen familjeform som standard:** barn bor "hela tiden" tills du väljer växelvis. Nytt: eget 14-dagarsschema (2-2-3, 2-2-5-5, varannan helg …).
- **Hos oss:** barn med olika rytm får en rad var, och det står "byter hem" i stället för "åker".
- **Förskola och fritids:** omsorgstider per veckodag, vem som lämnar och hämtar (ändras per dag på tavlan), dagens tider från Vklass, och varning en vecka i förväg för planeringsdagar och stängt.
- **Matcher alla veckor, träningar bara när barnet är här:** nu ett tydligt val på idrottskalendern.
- **Skärmar låses upp med PIN en gång:** andra enheter på nätverket kommer inte åt tavlan.
- Vklass-barn kopplas automatiskt på förnamn. Skjutsval sparas på kalenderhändelsens UID, så de finns kvar om träningen flyttas.
- Startskärmen ryms på en iPad, tydligare guide, säkrare beroenden.

## 0.1.0

- Första versionen: familjetavla, installationsguide, hämtning från Home Assistant, leverantörsmoduler för skola, mataffär, sopor och elpris.
