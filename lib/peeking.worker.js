import { simulatePeeking } from "./peeking.js";
self.onmessage = (e) => {
  try {
    const result = simulatePeeking({
      ...e.data,
      onProgress: (strategy, done, total) =>
        self.postMessage({ type: "progress", strategy, done, total }),
    });
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof Error ? error.message : "模拟失败，请调整参数。",
    });
  }
};
