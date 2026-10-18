// Delade typer mellan server och webb. Importeras av webben med `import type`.

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1 = måndag … 7 = söndag (ISO)

export type CustodyMode =
  | "always" // bor alltid här
  | "oddWeeks" // udda ISO-veckor
  | "evenWeeks" // jämna ISO-veckor
  | "alternating"; // varannan vecka räknat från ett startdatum (tål vecka 53)

export interface Custody {
  mode: CustodyMode;
  /** Ett datum (YYYY-MM-DD) som ligger i en vecka då barnet är här. Används av "alternating". */
  anchorDate?: string;
  /** Veckodag då bytet sker och "barnveckan" börjar. Standard måndag. */
  handoverDay?: Weekday;
}

export interface Person {
  id: string;
  name: string;
  color: string;
  kind: "adult" | "child";
  custody?: Custody;
}

export type CalendarCategory = "family" | "sport" | "school" | "work" | "other";

export type CalendarProvider = "google" | "icloud" | "laget" | "sportadmin" | "outlook" | "ics" | "ha";

export interface CalendarSource {
  id: string;
  name: string;
  provider: CalendarProvider;
  /** "ics": URL lagras som hemlighet `calendar.<id>.url`. "ha": entity_id. */
  kind: "ics" | "ha";
  entityId?: string;
  personId?: string;
  category: CalendarCategory;
  /** Visa bara händelser som matchar något av dessa (lag, grupp eller ord). Tomt = alla. */
  include?: string[];
  /** Dölj händelser som matchar något av dessa. */
  exclude?: string[];
  /**
   * Barnkalendrar: "custody" = bara barnets veckor (standard), "always" = alla veckor.
   * `alwaysShow` gör undantag, t.ex. ["match", "cup"] – matcher syns varje vecka men träningar bara barnveckor.
   */
  visibility?: "custody" | "always";
  alwaysShow?: string[];
}

// ---------- Leverantörsmoduler (skola, mataffär, sopor, elpris) ----------

export type IntegrationCategory = "school" | "grocery" | "waste" | "price";

export type FieldType = "text" | "password" | "url" | "number" | "select" | "entity" | "toggle" | "schedule";

/** Egen sophämtning: ett kärl som töms med fast intervall. Lagras som JSON i fältet "schedule". */
export interface ManualPickup {
  type: string;
  /** Första (eller någon) hämtdag, YYYY-MM-DD. */
  firstDate: string;
  everyWeeks: number;
  /** Bara dessa månader (1–12). Tomt = hela året. */
  months?: number[];
}

/** Ett fält som installationsguiden ritar upp för en leverantör. */
export interface ProviderField {
  key: string;
  label: string;
  type: FieldType;
  /** Lagras krypterat och skickas aldrig tillbaka till webbläsaren. */
  secret?: boolean;
  optional?: boolean;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
  /** För "entity": vilka HA-domäner som listas. */
  domains?: string[];
  default?: string | number | boolean;
}

export interface ProviderMeta {
  id: string;
  category: IntegrationCategory;
  name: string;
  description: string;
  status: "stable" | "beta" | "experimental";
  /** Kräver Home Assistant. */
  needsHa?: boolean;
  fields: ProviderField[];
  /** Steg-för-steg-hjälp som visas i guiden. */
  guide?: string[];
  /** Skola: leverantören hittar själv barnen (t.ex. Vklass) i stället för en kalender per barn. */
  discoversChildren?: boolean;
}

export type SettingValue = string | number | boolean;

export interface Integration {
  id: string;
  category: IntegrationCategory;
  provider: string;
  settings: Record<string, SettingValue>;
  /** Skola: namn hos leverantören → personens id. */
  personMap?: Record<string, string>;
  /** Skola via ICS: vilket barn kalendern gäller. */
  personId?: string;
}

/** Svar från "Testa" i guiden. */
export interface TestResult {
  ok: boolean;
  message?: string;
  /** Exempelrader att visa, t.ex. kommande händelser. */
  preview?: string[];
  /** Val som upptäcktes, t.ex. adresser hos renhållaren eller barn i Vklass. */
  choices?: { field: string; options: { value: string; label: string }[] };
  /** Namn som hittades (barn i skolplattformen) och kan kopplas till personer. */
  discovered?: string[];
}

// ---------- Home Assistant-entiteter (märkesoberoende) ----------

export interface CarEntity {
  name: string;
  battery: string;
  range?: string;
  location?: string; // device_tracker, binary_sensor eller sensor
  charging?: string;
  /** Förvärmning: climate.*, switch.* eller button.* på bilen. */
  climate?: string;
}

export interface DeviceCard {
  title: string;
  /** Stort värde överst, t.ex. inomhustemperatur. */
  primary?: string;
  sensors: string[];
  /** switch, select, number, button, input_* … */
  controls: string[];
}

/** Tidsstyrning som servern kör, t.ex. värmestart i bilen eller spabad. */
export interface Schedule {
  id: string;
  name: string;
  entityId: string;
  action: "on" | "off" | "press";
  /** ISO-veckodagar 1–7. */
  days: number[];
  time: string; // "06:40"
  enabled: boolean;
}

export interface NamedEntity {
  name: string;
  entityId: string;
}

export interface EnergyEntities {
  /** Solproduktion (W eller kW) – valfri växelriktare. */
  solar?: string;
  /** Effekt från/till elnätet (positiv = köp). */
  grid?: string;
  /** Husets totala förbrukning. */
  house?: string;
  /** Hembatteri, laddnivå i %. */
  battery?: string;
}

export interface Config {
  version: 1;
  setupComplete: boolean;
  household: {
    name: string;
    postcode?: string;
    place?: string;
    municipality?: string;
    lat?: number;
    lon?: number;
  };
  people: Person[];
  calendars: CalendarSource[];
  integrations: Integration[];
  shopping: {
    source: "local" | "ha";
    entityId?: string; // todo.* i Home Assistant
    /** Inköpsrad (gemener) → vald produkt per butik: mappings[provider][rad] */
    mappings: Record<string, Record<string, { code: string; name: string }>>;
  };
  electricity: {
    /** Antal billigaste timmar i följd som markeras. */
    cheapHours: number;
    /** Påslag från elbolaget, öre/kWh exkl. moms. */
    markupOre: number;
    /** Elöverföring/nätavgift, öre/kWh exkl. moms. */
    gridOre: number;
    /** Energiskatt, öre/kWh exkl. moms. */
    taxOre: number;
    vat: boolean;
  };
  ha: {
    mode: "none" | "supervisor" | "manual";
    url?: string;
  };
  schedules: Schedule[];
  entities: {
    cars: CarEntity[];
    energy: EnergyEntities;
    /** Snabbknappar på hemvyn. */
    lights: NamedEntity[];
    temps: NamedEntity[];
    /** Ljusfliken: grupper med Tänd alla / Släck alla. */
    lightGroups: { name: string; entities: string[] }[];
    /** Scener, skript och knappar, t.ex. "Godnatt – släck uppe". */
    buttons: { name: string; entityId: string; style: "accent" | "blue" | "amber" | "plain" }[];
    /** Hus-fliken: climate.* och water_heater.* (värmepump, termostat, varmvatten, spabad). */
    climates: (NamedEntity & { controls?: string[] })[];
    /** Hus-fliken: kort byggda av valfria sensorer och reglage (t.ex. värmepump via Husdata). */
    deviceCards: DeviceCard[];
    /** Grafer-fliken. */
    graphs: { title: string; series: { name: string; entityId: string; color: string }[] }[];
  };
  dashboard: {
    accent: string;
    theme: "auto" | "dark" | "light";
    nightFrom: string; // "22:00"
    nightTo: string; // "06:00"
  };
}

/** Hemligheter som aldrig skickas till webbläsaren. */
export type SecretKey =
  | "ha.token"
  | "admin.pin"
  | `calendar.${string}.url`
  | `int.${string}.${string}`;

export interface ConfigResponse {
  config: Config;
  /** Vilka hemligheter som är satta (aldrig deras värden). */
  secretsSet: string[];
  providers: ProviderMeta[];
  runtime: {
    supervisor: boolean;
    version: string;
    pinRequired: boolean;
  };
}

// ---------- Tavlan ----------

/** Ett reglage på tavlan, ritat efter HA-domän. */
export interface Control {
  entityId: string;
  name: string;
  domain: string;
  state: string;
  on: boolean;
  offline: boolean;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export interface DashEvent {
  time: string; // "17:30" eller "" för heldag
  title: string;
  color: string;
  who: string;
  category: CalendarCategory | "waste";
}

export interface DashDay {
  key: string; // YYYY-MM-DD
  name: string; // "Idag", "Mån" …
  date: string; // "19 okt"
  isToday: boolean;
  childrenHome: string[];
  events: DashEvent[];
}

export interface Reminder {
  icon: "rain" | "bag" | "gym" | "trash" | "kids" | "info";
  title: string;
  sub: string;
  tone: "blue" | "amber" | "neutral" | "green";
}

export interface PriceBar {
  hour: string; // "00"
  price: number;
  cheap: boolean;
  current: boolean;
}

export interface Dashboard {
  generatedAt: string;
  header: {
    dateLabel: string;
    week: number;
    weather?: string;
  };
  reminders: Reminder[];
  custody?: {
    headline: string;
    sub: string;
    daysLeft: number;
    progress: number; // 0–1
  };
  legend: { name: string; color: string }[];
  days: DashDay[];
  shopping: { source: "local" | "ha"; items: { id: string; name: string; done: boolean }[] };
  /** Butik att skicka inköpslistan till, om en är vald. */
  grocery?: { provider: string; name: string };
  prices?: {
    now: number;
    level: "billigt" | "normalt" | "dyrt";
    /** "spot" = spotpris, "total" = med påslag, nät, skatt och moms. */
    kind: "spot" | "total";
    bars: PriceBar[];
    cheapest?: { from: string; to: string; avg: number };
  };
  energy?: {
    solarKw?: number;
    /** Positiv = köper från nätet, negativ = säljer. */
    gridKw?: number;
    houseKw?: number;
    batteryPct?: number;
  };
  schoolFood?: { child: string; day: string; dishes: string[] }[];
  cars: {
    name: string;
    battery: number | null;
    rangeKm: number | null;
    home: boolean | null;
    charging: boolean;
    /** Timmar sedan batterivärdet uppdaterades. */
    ageHours: number | null;
    status: string;
    climate?: { entityId: string; on: boolean };
    schedules: { id: string; name: string; days: number[]; time: string; enabled: boolean }[];
  }[];
  lights: { entityId: string; name: string; on: boolean; offline: boolean }[];
  lightGroups: { index: number; name: string; on: number; total: number; offline: string[] }[];
  buttons: { entityId: string; name: string; style: "accent" | "blue" | "amber" | "plain" }[];
  climates: {
    entityId: string;
    name: string;
    domain: "climate" | "water_heater";
    current: number | null;
    target: number | null;
    action?: string;
    /** Lägen att välja mellan (preset_modes, hvac_modes eller operation_list). */
    modes: { value: string; label: string; field: "preset_mode" | "hvac_mode" | "operation_mode" }[];
    active?: string;
    /** Pumpar, lampor, blåsare m.m. på samma enhet (t.ex. spabadets). */
    controls: Control[];
  }[];
  temps: { name: string; value: string }[];
  deviceCards: {
    index: number;
    title: string;
    primary?: { name: string; value: string };
    rows: { name: string; value: string; ok: boolean }[];
    controls: Control[];
  }[];
  graphs: { index: number; title: string }[];
  accent: string;
  theme: "auto" | "dark" | "light";
  /** Dygnsfärger: "day" eller "night" utifrån klockan. */
  daypart: "day" | "night";
  night: boolean;
  errors: { source: string; message: string }[];
}
