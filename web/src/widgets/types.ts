import type { ReactNode } from "react";
import type { Dashboard } from "../../../server/src/types";
import type { Actions, Tab } from "../dashboard/Dashboard";
import type { PageId } from "../dashboard/Detail";

/** Every card the home screen can show, as chosen under Startskärm. */
export type WidgetId = Dashboard["home"][number]["id"];

export interface WidgetCtx {
  data: Dashboard;
  actions: Actions;
  /** On the "Alla kort" page: show lists in full instead of the home-screen summary. */
  full: boolean;
}

/**
 * A card on the board. One file per card in web/src/widgets/, listed in index.ts.
 * The home screen lays the cards out by `size`; a card with nothing to show returns 0 and is left out.
 */
export interface WidgetModule {
  id: Exclude<WidgetId, "now" | "week">;
  /** Name in Startskärm (settings). */
  label: string;
  /** Rough height in rows from the data, used to split cards into columns. 0 = nothing to show. */
  size: (data: Dashboard) => number;
  render: (ctx: WidgetCtx) => ReactNode;
  /** Tapping the card (not its buttons) opens this page or tab. */
  opens?: { page: PageId } | { tab: Tab };
}
