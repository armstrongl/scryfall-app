// Scryfall API client and request queue. Every call to api.scryfall.com goes
// through the queue in this module. No other module calls fetch for the API.
//
// Queue rules (PLAN.md section 3.3):
// - One request at a time.
// - At least REQUEST_SPACING_MS between the start of one request and the next.
// - After a 429, pause all requests for RATE_LIMIT_PAUSE_MS, then send the
//   same request one more time. A second 429 rejects it.
// - A caller can cancel its queued requests with an AbortSignal.

import {
  ACCEPT_HEADER, API_BASE, COLLECTION_BATCH_SIZE, RATE_LIMIT_PAUSE_MS, REQUEST_SPACING_MS,
} from "./config.js";

/**
 * @typedef {Object} ApiError
 * @property {"notFound"|"badRequest"|"rateLimited"|"server"|"network"|"cancelled"} kind
 * @property {number|null} status
 * @property {string|null} code
 * @property {string} details
 * @property {string[]} warnings
 */

export class ScryfallError extends Error {
  /** @param {ApiError} info */
  constructor(info) {
    super(info.details || info.kind);
    this.name = "ScryfallError";
    this.kind = info.kind;
    this.status = info.status;
    this.code = info.code;
    this.details = info.details;
    this.warnings = info.warnings;
  }
}

const cancelled = () =>
  new ScryfallError({ kind: "cancelled", status: null, code: null, details: "Cancelled.", warnings: [] });

/**
 * Maps an HTTP status and a parsed body to an error. Pure.
 * @param {number} status
 * @param {any} body The parsed JSON, or null.
 * @returns {ScryfallError}
 */
export function mapErrorResponse(status, body) {
  const isErr = body && body.object === "error";
  const code = isErr ? body.code ?? null : null;
  const details = isErr && typeof body.details === "string" ? body.details : "";
  const warnings = isErr && Array.isArray(body.warnings) ? body.warnings.map(String) : [];
  let kind;
  if (status === 429) kind = "rateLimited";
  else if (status === 404 && code === "not_found") kind = "notFound";
  else if (status >= 500) kind = "server";
  else kind = "badRequest";
  return new ScryfallError({ kind, status, code, details, warnings });
}

/**
 * Interface text for an error. Pure. See PLAN.md section 3.4.
 * @param {ScryfallError|Error} err
 */
export function errorMessage(err) {
  switch (err?.kind) {
    case "notFound":
      return "No cards match these criteria. Remove a filter and try again.";
    case "badRequest": {
      const parts = [err.details || "Scryfall can't use this request. Change the query and try again."];
      for (const w of err.warnings ?? []) parts.push(w);
      return parts.join(" ");
    }
    case "rateLimited":
      return "Scryfall paused requests. Wait 30 seconds, then try again.";
    case "server":
      return "Scryfall is not available. Try again later.";
    case "network":
      return "Can't connect to Scryfall. Check your connection and try again.";
    case "cancelled":
      return "Cancelled.";
    default:
      return err?.message || "Something went wrong. Reload the page and try again.";
  }
}

/** @typedef {{now: () => number, sleep: (ms: number) => Promise<void>}} QueueClock */

/** @type {QueueClock} */
const realClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/**
 * @param {Object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {QueueClock} [options.clock]
 * @param {number} [options.spacingMs]
 * @param {number} [options.pauseMs]
 * @param {(pausedUntil: number|null) => void} [options.onPauseChange] Called with the end
 *   time of a pause when it starts, and with null when it ends.
 */
export function createClient(options = {}) {
  const fetchImpl = options.fetchImpl ?? ((...a) => globalThis.fetch(...a));
  const clock = options.clock ?? realClock;
  const spacingMs = options.spacingMs ?? REQUEST_SPACING_MS;
  const pauseMs = options.pauseMs ?? RATE_LIMIT_PAUSE_MS;
  const onPauseChange = options.onPauseChange ?? (() => {});

  /** @type {{path: string, init: RequestInit, signal?: AbortSignal, retried: boolean, resolve: Function, reject: Function}[]} */
  const queue = [];
  let running = false;
  let lastStart = -Infinity;
  let pausedUntil = 0;

  function dropCancelled() {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].signal?.aborted) queue.splice(i, 1)[0].reject(cancelled());
    }
  }

  async function send(item) {
    let res;
    try {
      res = await fetchImpl(API_BASE + item.path, { ...item.init, signal: item.signal });
    } catch (e) {
      if (item.signal?.aborted) return { error: cancelled() };
      return {
        error: new ScryfallError({ kind: "network", status: null, code: null, details: String(e?.message ?? e), warnings: [] }),
      };
    }
    let body = null;
    try {
      body = await res.json();
    } catch {
      // A cancel can land while the body is being read.
      if (item.signal?.aborted) return { error: cancelled() };
      body = null;
    }
    if (res.ok && body) return { body };
    if (res.ok) {
      return { error: new ScryfallError({ kind: "server", status: res.status, code: null, details: "", warnings: [] }) };
    }
    return { error: mapErrorResponse(res.status, body), status: res.status };
  }

  async function pump() {
    if (running) return;
    running = true;
    try {
      while (queue.length > 0) {
        dropCancelled();
        if (queue.length === 0) break;
        const now = clock.now();
        const wait = Math.max(lastStart + spacingMs - now, pausedUntil - now, 0);
        if (wait > 0) {
          await clock.sleep(wait);
          if (pausedUntil && clock.now() >= pausedUntil) {
            pausedUntil = 0;
            onPauseChange(null);
          }
          continue;
        }
        const item = queue.shift();
        lastStart = clock.now();
        const result = await send(item);
        if (result.status === 429) {
          // Pause everything. Retry this request once; a second 429 rejects
          // it, and the pause still protects the requests behind it.
          pausedUntil = clock.now() + pauseMs;
          onPauseChange(pausedUntil);
          if (!item.retried) {
            item.retried = true;
            queue.unshift(item);
            continue;
          }
        }
        if (result.error) item.reject(result.error);
        else item.resolve(result.body);
      }
    } finally {
      running = false;
    }
  }

  /**
   * Puts a request in the queue.
   * @param {string} path Starts with "/".
   * @param {{method?: string, body?: any, signal?: AbortSignal}} [opts]
   * @returns {Promise<any>} The parsed JSON body.
   */
  function request(path, opts = {}) {
    if (opts.signal?.aborted) return Promise.reject(cancelled());
    const headers = { Accept: ACCEPT_HEADER };
    const init = { method: opts.method ?? "GET", headers };
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    return new Promise((resolve, reject) => {
      queue.push({ path, init, signal: opts.signal, retried: false, resolve, reject });
      opts.signal?.addEventListener("abort", () => {
        const i = queue.findIndex((q) => q.resolve === resolve);
        if (i >= 0) queue.splice(i, 1)[0].reject(cancelled());
      }, { once: true });
      pump();
    });
  }

  return {
    request,
    /** Number of requests waiting to start. */
    get pending() {
      return queue.length;
    },
    /** @param {string} q @param {AbortSignal} [signal] */
    random(q, signal) {
      const qs = q ? `?q=${encodeURIComponent(q)}` : "";
      return request(`/cards/random${qs}`, { signal });
    },
    /**
     * @param {string} q
     * @param {{unique?: string, order?: string, dir?: string, page?: number}} [params]
     * @param {AbortSignal} [signal]
     */
    search(q, params = {}, signal) {
      const sp = new URLSearchParams({ q });
      if (params.unique) sp.set("unique", params.unique);
      if (params.order) sp.set("order", params.order);
      if (params.dir && params.dir !== "auto") sp.set("dir", params.dir);
      if (params.page) sp.set("page", String(params.page));
      return request(`/cards/search?${sp.toString()}`, { signal });
    },
    /**
     * Official rulings for a card.
     * @param {string} scryfallId
     * @param {AbortSignal} [signal]
     */
    rulings(scryfallId, signal) {
      return request(`/cards/${encodeURIComponent(scryfallId)}/rulings`, { signal });
    },
    /**
     * Gets cards by Scryfall ID, COLLECTION_BATCH_SIZE IDs per request.
     * @param {string[]} ids
     * @returns {Promise<{data: any[], notFound: any[]}>}
     */
    async collection(ids, signal) {
      const data = [];
      const notFound = [];
      for (let i = 0; i < ids.length; i += COLLECTION_BATCH_SIZE) {
        const identifiers = ids.slice(i, i + COLLECTION_BATCH_SIZE).map((id) => ({ id }));
        const res = await request("/cards/collection", { method: "POST", body: { identifiers }, signal });
        data.push(...(res.data ?? []));
        notFound.push(...(res.not_found ?? []));
      }
      return { data, notFound };
    },
  };
}
