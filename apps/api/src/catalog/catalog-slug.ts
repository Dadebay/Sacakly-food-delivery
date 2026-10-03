const transliteration: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  ä: "a",
  ç: "c",
  ş: "s",
  ž: "z",
  ň: "n",
  ö: "o",
  ü: "u",
  ý: "y",
};

export function catalogSlug(value: string, maxLength: number) {
  const transliterated = [...value.toLocaleLowerCase("ru-RU")]
    .map((character) => transliteration[character] ?? character)
    .join("")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");

  return transliterated || "item";
}

export function availableCatalogSlug(
  base: string,
  usedSlugs: Iterable<string>,
  maxLength: number,
) {
  const used = new Set(usedSlugs);
  if (!used.has(base)) return base;

  for (let suffix = 2; ; suffix += 1) {
    const ending = `-${suffix}`;
    const candidate = `${base.slice(0, maxLength - ending.length).replace(/-+$/g, "")}${ending}`;
    if (!used.has(candidate)) return candidate;
  }
}
