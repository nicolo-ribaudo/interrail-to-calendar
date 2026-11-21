/**
 * Ensure `globalThis.Temporal` exists. Node ≥ 26 and recent Firefox/Chrome ship it
 * natively; elsewhere (e.g. Safari) the polyfill is loaded on demand, so browsers
 * with native support never download it.
 *
 * Import this module (for its side effect) before any code that uses `Temporal`
 * at module-evaluation or render time. It uses top-level await, so importers wait
 * until the polyfill is installed.
 */
if (typeof globalThis.Temporal === "undefined") {
  await import("temporal-polyfill/global");
}

export {};
