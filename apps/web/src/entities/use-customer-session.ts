"use client";
import { useSyncExternalStore } from "react";
import { customerApi, type Session } from "@/shared/api";
function subscribe(callback: () => void) { window.addEventListener("session-change", callback); return () => window.removeEventListener("session-change", callback); }
function getSnapshot() { return sessionStorage.getItem("sacakly.web.session"); }
function getServerSnapshot() { return null; }
export function useCustomerSession(): Session | null { const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot); return raw ? customerApi.getSession() : null; }
