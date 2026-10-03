export type OrderAlertSoundState =
  | "inactive"
  | "ready"
  | "blocked"
  | "unsupported";

/** One reusable audio context per mounted alert; no downloads or audio polling. */
export function createOrderAlertSound(
  onStateChange: (state: OrderAlertSoundState) => void,
  createContext: () => AudioContext | null = () =>
    typeof AudioContext === "undefined" ? null : new AudioContext(),
) {
  let context: AudioContext | null = null;
  let disposed = false;

  function report(state: OrderAlertSoundState) {
    if (!disposed) onStateChange(state);
  }

  function play() {
    // Never queue a sound in a suspended context: it could play much later.
    if (disposed || !context || context.state !== "running") return false;
    try {
      const start = context.currentTime;
      for (const [offset, frequency] of [[0, 784], [0.3, 1046]]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start + offset);
        gain.gain.linearRampToValueAtTime(0.22, start + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.4);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(start + offset);
        oscillator.stop(start + offset + 0.42);
      }
      return true;
    } catch {
      report("blocked");
      return false;
    }
  }

  async function enable(preview = false) {
    if (disposed) return;
    try {
      if (!context || context.state === "closed") {
        context = createContext();
        if (!context) {
          report("unsupported");
          return;
        }
        const active = context;
        active.onstatechange = () => {
          if (context === active) {
            report(active.state === "running" ? "ready" : "blocked");
          }
        };
      }
      const active = context;
      if (active.state !== "running") await active.resume();
      if (disposed || context !== active) return;
      report(active.state === "running" ? "ready" : "blocked");
      if (preview) play();
    } catch {
      report("blocked");
    }
  }

  function stop() {
    const previous = context;
    context = null;
    if (previous) {
      previous.onstatechange = null;
      void previous.close().catch(() => {});
    }
    report("inactive");
  }

  return {
    enable,
    play,
    stop,
    isReady: () => context?.state === "running",
    dispose: () => {
      disposed = true;
      stop();
    },
  };
}
