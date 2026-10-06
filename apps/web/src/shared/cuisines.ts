import type { Cafe } from "./api";
import type { Locale } from "./i18n";

export type Cuisine = Cafe["cuisines"][number];
export const cuisineOrder: Cuisine[] = ["SUSHI", "BURGERS", "FAST_FOOD", "PIZZA", "TURKMEN", "BAKERY", "COFFEE", "OTHER"];
export const cuisineLabels: Record<Locale, Record<Cuisine, string>> = {
  tk: { SUSHI: "Suşi", BURGERS: "Burger", FAST_FOOD: "Çalt nahar", PIZZA: "Pitsa", TURKMEN: "Türkmen tagamlary", BAKERY: "Çörek önümleri", COFFEE: "Kofe we süýji", OTHER: "Beýleki" },
  ru: { SUSHI: "Суши", BURGERS: "Бургеры", FAST_FOOD: "Фастфуд", PIZZA: "Пицца", TURKMEN: "Туркменская кухня", BAKERY: "Выпечка", COFFEE: "Кофе и десерты", OTHER: "Другое" },
  en: { SUSHI: "Sushi", BURGERS: "Burgers", FAST_FOOD: "Fast food", PIZZA: "Pizza", TURKMEN: "Turkmen food", BAKERY: "Bakery", COFFEE: "Coffee and dessert", OTHER: "Other" },
};
export const allCuisineLabels: Record<Locale, string> = { tk: "Hemmesi", ru: "Все кафе", en: "All cafes" };

export function asCuisine(value: string | string[] | undefined): Cuisine | undefined {
  return typeof value === "string" && cuisineOrder.includes(value as Cuisine) ? value as Cuisine : undefined;
}
