// Shared by the server and the board (no Node imports here).

/** Side dishes and filler words – sharing these does not make it "the same food". */
export const MEAL_STOPWORDS = new Set(
  "potatis potatismos kokt kokta stekt stekta ugnsstekt ugnsrostad ugnsrostade pasta spagetti makaroner sallad salladen grönsaker rotfrukter tomatsås gräddsås sås såsen serveras serveras ekologisk ekologiska hemlagad hemlagade vegetarisk vegetariskt dagens kokosmjölk bröd smör knäckebröd mjölk lingon gurka tomat morötter ugnen pommes bulgur couscous nudlar ris".split(" "),
);

export function sameAsLunch(dinner: string | undefined, lunch: { dishes: string[] }[]): string | null {
  if (!dinner) return null;
  const words = (s: string) => new Set((s.toLowerCase().match(/[a-zåäöé]{5,}/g) ?? []).filter((w) => !MEAL_STOPWORDS.has(w)));
  const d = words(dinner);
  for (const l of lunch) for (const dish of l.dishes) for (const w of words(dish)) if (d.has(w)) return dish;
  return null;
}
