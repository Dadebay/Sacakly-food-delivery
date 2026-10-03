import { useEffect, useRef, useState } from "react";
import {
  createOrderAlertSound,
  type OrderAlertSoundState,
} from "../lib/order-alert-sound";

export function useOrderAlertSound(userId: string) {
  const storageKey = `a7.order-alert-muted.v1:${userId}`;
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "true";
    } catch {
      return false;
    }
  });
  const mutedRef = useRef(muted);
  const soundRef = useRef<ReturnType<typeof createOrderAlertSound> | null>(null);
  const [state, setState] = useState<OrderAlertSoundState>("inactive");

  useEffect(() => {
    const sound = createOrderAlertSound(setState);
    soundRef.current = sound;
    const unlock = (event: Event) => {
      if (
        event.target instanceof Element &&
        event.target.closest(
          '[data-testid="new-order-alert-sound-toggle"], [data-testid="new-order-alert-sound-test"]',
        )
      ) return;
      if (!mutedRef.current && !sound.isReady()) void sound.enable();
    };
    // Also works after reloading a tab; saved preferences cannot bypass autoplay.
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      soundRef.current = null;
      sound.dispose();
    };
  }, []);

  function setSoundMuted(value: boolean) {
    mutedRef.current = value;
    setMuted(value);
    try {
      localStorage.setItem(storageKey, String(value));
    } catch {
      // The toggle still works in memory if browser storage is unavailable.
    }
    if (value) soundRef.current?.stop();
    else void soundRef.current?.enable(true);
  }

  return {
    muted,
    state,
    setMuted: setSoundMuted,
    test: () => void soundRef.current?.enable(true),
    play: () => {
      if (!mutedRef.current) soundRef.current?.play();
    },
  };
}
