import { describe, expect, it } from "vitest";
import { parseVklassWelcome, vklassDayLabel } from "./connectors/vklass.js";

// Same structure as the real custodian start page (2026-10-19), made-up names and food.
const card = (name: string, extra: string, days: [string, string[]][]) => `
<div class="vk-student-card">
  <div class="vk-student-card-header opaque"><vkau-icon-badge></vkau-icon-badge><h2 class="vk-student-card-header__text">${name}</h2></div>
  <div class="vk-student-card-content vk-swipe__item__invisible-outside-viewport"><div>${extra}</div></div>
  ${days
    .map(([d, dishes]) => `<div><div class="vk-student-card__day"><h3>${d}</h3><div class="vk-student-card__day__food"><h4>Matsedel</h4><ul>${dishes.map((x) => `<li>${x}</li>`).join("")}</ul></div></div></div>`)
    .join("")}
</div>`;
const html =
  card(
    "Kim",
    `<div class="vk-display"><div class="vk-display__header">Omsorgstid</div><div class="vk-display__content"><a class="vk-link" href="#/CareSchedule/Overview"><span class="vk-link__text-wrapper"><span class="vk-link__text">07:15 - 16:00</span></span></a><div class="vk-flex"><span class="text-bold">Ej närvarande</span></div></div></div>`,
    [["Idag", ["Vegetarisk rätt"]], ["Imorgon", ["Fiskgratäng", "Potatismos"]], ["fredag", ["Tacos"]]],
  ) +
  card("Alex", `<a href="/Schedule?studentIds=4711">Nästa lektion</a>`, [["Idag", ["Korv med mos", "Vegetarisk korv med mos"]]]);

describe("Vklass start page", () => {
  const today = new Date(2026, 9, 20); // tisdag
  const kids = parseVklassWelcome(html, today);

  it("finds every child, also a preschool child without lessons", () => {
    expect(kids.map((k) => k.name)).toEqual(["Kim", "Alex"]);
    expect(kids[1].id).toBe("4711");
    expect(kids[0].id).toBe("");
  });

  it("reads the menu per day with real dates", () => {
    expect(kids[0].food).toEqual([
      { day: "tisdag 20/10", dishes: ["Vegetarisk rätt"] },
      { day: "onsdag 21/10", dishes: ["Fiskgratäng", "Potatismos"] },
      { day: "fredag 23/10", dishes: ["Tacos"] },
    ]);
    expect(kids[1].food[0].dishes).toEqual(["Korv med mos", "Vegetarisk korv med mos"]);
  });

  it("reads the care time", () => {
    expect(kids[0].careTime).toBe("07:15 - 16:00");
    expect(kids[1].careTime).toBeUndefined();
  });

  it("turns Idag/Imorgon/weekday into a date", () => {
    expect(vklassDayLabel("Idag", today)).toBe("tisdag 20/10");
    expect(vklassDayLabel("Imorgon", today)).toBe("onsdag 21/10");
    expect(vklassDayLabel("tisdag", today)).toBe("tisdag 27/10");
    expect(vklassDayLabel("måndag", new Date(2026, 9, 23))).toBe("måndag 26/10");
  });
});
