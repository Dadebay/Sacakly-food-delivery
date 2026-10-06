import type { Cuisine } from "../api/client";

export const cuisineLabels: Record<Cuisine, string> = {
  SUSHI: "Суши",
  BURGERS: "Бургеры",
  FAST_FOOD: "Фастфуд",
  PIZZA: "Пицца",
  TURKMEN: "Туркменская кухня",
  BAKERY: "Выпечка",
  COFFEE: "Кофе и десерты",
  OTHER: "Другое",
};
export const cuisineKeys = Object.keys(cuisineLabels) as Cuisine[];
