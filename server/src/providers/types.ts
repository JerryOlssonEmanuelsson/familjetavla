import type { CalEvent } from "../connectors/ics.js";
import type { Product } from "../connectors/axfood.js";
import type { HourPrice } from "../connectors/elpris.js";
import type { Pickup } from "../connectors/waste.js";
import type { Integration, ProviderMeta, SettingValue, TestResult } from "../types.js";

/**
 * Context handed to a provider. `secret(key)` reads an encrypted field of this integration
 * (fields marked `secret: true` in the meta), `remember` stores provider-private state such
 * as a login session.
 */
export interface ProviderCtx {
  integration: Integration;
  settings: Record<string, SettingValue>;
  str(key: string): string;
  secret(key: string): string | undefined;
  remember(key: string, value: string | null): void;
}

export interface SchoolEvent extends CalEvent {
  /** Name of the child as known by the provider (matched via personMap). */
  child?: string;
  /** Lesson that needs gym clothes. */
  gym?: boolean;
}

export interface SchoolProvider {
  meta: ProviderMeta;
  test(ctx: ProviderCtx): Promise<TestResult>;
  fetch(ctx: ProviderCtx, from: Date, to: Date): Promise<{ events: SchoolEvent[]; food?: { child: string; day: string; dishes: string[] }[] }>;
}

export interface GroceryProvider {
  meta: ProviderMeta;
  test(ctx: ProviderCtx): Promise<TestResult>;
  search(ctx: ProviderCtx, query: string): Promise<Product[]>;
  addToCart(ctx: ProviderCtx, lines: { code: string; qty: number }[]): Promise<{ items: number | null; total: string | null }>;
}

export interface WasteProvider {
  meta: ProviderMeta;
  test(ctx: ProviderCtx): Promise<TestResult>;
  fetch(ctx: ProviderCtx): Promise<Pickup[]>;
}

export interface PriceProvider {
  meta: ProviderMeta;
  test(ctx: ProviderCtx): Promise<TestResult>;
  /** Hourly prices in SEK/kWh for today and, when published, tomorrow. */
  fetch(ctx: ProviderCtx, now: Date): Promise<HourPrice[]>;
}

export type AnyProvider = SchoolProvider | GroceryProvider | WasteProvider | PriceProvider;
