# Prova Familjetavla i molnet (utan egen server)

Med GitHub Codespaces körs tavlan på en tillfällig server hos GitHub. Bra för att prova med
riktiga uppgifter – Vklass, SchoolSoft, kalenderlänkar, sopor och elpris – innan du installerar hemma.

## Starta

1. Öppna **https://codespaces.new/murre87/familjetavla?quickstart=1** och logga in på GitHub.
2. Tryck **Create codespace**. Första gången tar det ett par minuter (paket installeras och tavlan byggs).
3. Tavlan startar av sig själv. Under fliken **Ports** finns rad **Familjetavla (8099)** – tryck på jordgloben
   för att öppna den i en egen flik. Adressen ser ut som `https://…-8099.app.github.dev`.
4. Gå igenom guiden och lägg in Vklass, kalendrar och resten. **Sätt en PIN** i sista steget.

## Öppna på iPad eller telefon

Adressen fungerar i Safari och Chrome. Du loggar in med ditt GitHub-konto första gången
(porten är privat). Lägg den gärna på hemskärmen: Dela → Lägg till på hemskärmen.

## Bra att veta

- **Home Assistant** går inte att koppla in härifrån – molnservern når inte ditt hemnät. Bil, ljus,
  värme och notiser till telefonen provar du när tavlan är installerad hemma.
- **Gratis** för privatpersoner upp till 60 timmar i månaden (2 kärnor). Codespacen stängs av efter
  30 minuter utan aktivitet; starta den igen från github.com/codespaces så finns allt kvar.
- **Dina uppgifter** sparas krypterat i mappen `data/` i din egen codespace och följer aldrig med till GitHub-projektet.
  Ta bort codespacen när du är klar (github.com/codespaces → … → Delete) så försvinner allt.
- Ger adressen 502 eller startar tavlan inte av sig själv: öppna Terminal och skriv `test -f server/dist/index.js || (npm ci && npm run build); node server/dist/index.js`. Loggen finns i `/tmp/familjetavla.log`.

När du sedan installerar hemma (tillägg eller Docker) går du igenom guiden igen – det tar fem minuter.
