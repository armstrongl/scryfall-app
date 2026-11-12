// The GitHub REST API client for sync. This is the only module that sends
// requests to api.github.com. It never sets User-Agent: the browser sets it.
// Docs: https://docs.github.com/en/rest/repos/contents

import { GITHUB_ACCEPT, GITHUB_API, GITHUB_API_VERSION } from "./config.js";

/** A failed GitHub request. `code` is a key of the errors in src/sync.js. */
export class GitHubError extends Error {
  /** @param {string} code @param {string} [message] */
  constructor(code, message) {
    super(message ?? code);
    this.name = "GitHubError";
    this.code = code;
  }
}

const RAW_ACCEPT = "application/vnd.github.raw+json";

/** Base64 of the UTF-8 bytes of a text. */
function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Text from GitHub's base64, which has line breaks in it. */
function fromBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function errorFor(res) {
  let message = "";
  try {
    message = (await res.json())?.message ?? "";
  } catch {
    // Not JSON. The status is enough.
  }
  if (res.status === 401) return new GitHubError("unauthorized", message);
  // GitHub answers a rate limit with 429, or with 403 and either no requests
  // left or a Retry-After header (a secondary rate limit).
  if (res.status === 429 || (res.status === 403 && (res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after")))) {
    return new GitHubError("rate-limited", message);
  }
  if (res.status === 403) return new GitHubError("forbidden", message);
  if (res.status === 404) return new GitHubError("not-found", message);
  // 409: the file changed since the sha that was sent. 422 about the sha: the
  // file appeared since it was read as missing. Any other 422 is a real error.
  if (res.status === 409 || (res.status === 422 && /\bsha\b/i.test(message))) return new GitHubError("conflict", message);
  return new GitHubError("server", `${res.status} ${message}`.trim());
}

/**
 * @param {{token: string, fetchImpl?: typeof fetch}} opts
 */
export function createGitHub({ token, fetchImpl = (...a) => fetch(...a) }) {
  /** @param {string} path @param {{method?: string, body?: any, accept?: string}} [opts] */
  async function request(path, { method = "GET", body, accept = GITHUB_ACCEPT } = {}) {
    const headers = {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    };
    if (body) headers["Content-Type"] = "application/json";
    try {
      return await fetchImpl(`${GITHUB_API}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        // The sync file changes on other devices. A cached copy would hide that.
        cache: "no-store",
      });
    } catch (e) {
      throw new GitHubError("network", String(e?.message ?? e));
    }
  }

  const enc = encodeURIComponent;
  const contents = (owner, repo, path) => `/repos/${enc(owner)}/${enc(repo)}/contents/${path.split("/").map(enc).join("/")}`;

  return {
    /** The repository, which says whether it is private. */
    async getRepo(owner, repo) {
      const res = await request(`/repos/${enc(owner)}/${enc(repo)}`);
      if (!res.ok) throw await errorFor(res);
      return res.json();
    },

    /**
     * Reads a file. Returns null if the file (or the whole repository
     * content, in an empty repository) doesn't exist.
     * @returns {Promise<{sha: string, text: string} | null>}
     */
    async readFile(owner, repo, path) {
      const res = await request(contents(owner, repo, path));
      if (res.status === 404) return null;
      if (!res.ok) throw await errorFor(res);
      const meta = await res.json();
      if (meta.encoding === "base64") return { sha: meta.sha, text: fromBase64(meta.content ?? "") };
      // GitHub leaves out the content of a file over 1 MB. Ask for it raw.
      const raw = await request(contents(owner, repo, path), { accept: RAW_ACCEPT });
      if (!raw.ok) throw await errorFor(raw);
      return { sha: meta.sha, text: await raw.text() };
    },

    /**
     * Creates or replaces a file. `sha` is the sha of the file being
     * replaced, or null for a new file. If the file changed since that sha,
     * GitHub refuses and this throws a "conflict" error.
     * @returns {Promise<string>} The file's new sha.
     */
    async writeFile(owner, repo, path, text, sha, message) {
      const body = { message, content: toBase64(text), ...(sha ? { sha } : {}) };
      const res = await request(contents(owner, repo, path), { method: "PUT", body });
      if (!res.ok) throw await errorFor(res);
      return (await res.json()).content.sha;
    },
  };
}
