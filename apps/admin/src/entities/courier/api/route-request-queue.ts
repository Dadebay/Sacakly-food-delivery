// Bound OSRM pressure while allowing each courier query to settle independently.
export function createRouteRequestQueue(concurrency = 3) {
  let active = 0;
  const waiting: Array<() => void> = [];
  function drain() {
    while (active < concurrency && waiting.length) waiting.shift()!();
  }
  return function run<T>(request: () => Promise<T>, signal: AbortSignal) {
    return new Promise<T>((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      const cancel = () => {
        const index = waiting.indexOf(start);
        if (index !== -1) waiting.splice(index, 1);
        reject(signal.reason);
      };
      const start = () => {
        signal.removeEventListener("abort", cancel);
        active++;
        void Promise.resolve()
          .then(request)
          .then(resolve, reject)
          .finally(() => {
            active--;
            drain();
          });
      };
      signal.addEventListener("abort", cancel, { once: true });
      waiting.push(start);
      drain();
    });
  };
}
