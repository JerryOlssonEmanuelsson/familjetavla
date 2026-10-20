import { describe, expect, it } from "vitest";
import { parseVklassNews, vklassPublished } from "./connectors/vklass.js";

// Shaped like the custodian start page in screenshots (names made up).
const html = `<html><body>
<div class="vk-student-card"><h2>Kim</h2><div class="vk-student-card__day"><h3>Idag</h3><ul><li>Fisk</li></ul></div></div>
<section class="news">
  <div class="news-item">
    <div class="row"><h2 class="title">Höstlov på biblioteket</h2><span class="circle">KI</span></div>
    <div class="meta"><span>Skolan 1-6 och <a href="#">2 till</a></span></div>
    <div class="meta"><span>Personal, elever och vårdnadshavare</span></div>
    <div class="body"><p>Välkommen till biblioteket på höstlovet!</p><p>Vi kör pärlcraft och workshop.</p></div>
    <div class="published">Publicerat 20 oktober 13:50 av Lärare Exempel</div>
    <div class="attachments"><h5>Länkat material</h5><a href="/Files/Download/2F07F3F5-E579-4DD9-9370-71ABCDEF0123">Höstlov affisch</a></div>
  </div>
  <div class="news-item">
    <div class="row"><h2 class="title">Presentation från mötet</h2><span class="circle">AL</span></div>
    <div class="body">Enligt önskemål kommer här presentationen.<br>Hälsningar</div>
    <div class="published">Publicerat 14 oktober 09:05 av Rektor</div>
  </div>
</section></body></html>`;

describe("Vklass news", () => {
  it("reads title, text, date, badge and files, without meta lines", () => {
    const news = parseVklassNews(html, new Date(2026, 9, 20, 15));
    expect(news.map((n) => n.title)).toEqual(["Höstlov på biblioteket", "Presentation från mötet"]);
    const [a, b] = news;
    expect(a.text).toBe("Välkommen till biblioteket på höstlovet!\nVi kör pärlcraft och workshop.");
    expect(a.badge).toBe("KI");
    expect(a.files).toEqual([{ name: "Höstlov affisch", url: "https://custodian.vklass.se/Files/Download/2F07F3F5-E579-4DD9-9370-71ABCDEF0123" }]);
    expect(new Date(a.published!).getMonth()).toBe(9);
    expect(b.text).toContain("Enligt önskemål");
    expect(b.files).toEqual([]);
    expect(a.id).not.toBe(b.id);
  });

  it("dates without a year that would be in the future are last year", () => {
    expect(new Date(vklassPublished("28 december 10:00", new Date(2027, 0, 3))!).getFullYear()).toBe(2026);
  });
});
