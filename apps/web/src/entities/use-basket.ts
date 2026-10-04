"use client";
import { useSyncExternalStore } from "react";
import { readBasket, type Basket } from "./cart";
function subscribe(callback: () => void) { window.addEventListener("basket-change", callback); return () => window.removeEventListener("basket-change", callback); }
function getSnapshot() { return sessionStorage.getItem("sacakly.web.basket"); }
function getServerSnapshot() { return null; }
export function useBasket(): Basket | null { const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot); return raw ? readBasket() : null; }
