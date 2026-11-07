#!/usr/bin/env node
// Checks every link in the help pages (src/docs.js) against the live web.
//
//   node scripts/check-links.mjs
//
// Each site gets one request at a time, at least 500 ms apart, with the
// CardDiscoveryDev/0.1 User-Agent. MTG Wiki pages are checked through the
// wiki's API, because the wiki blocks scripted page requests. A link with a
// #fragment passes only if the page has that ID. A site that answers 403 to
// scripts is reported as unchecked, not broken. Exits 1 if a link is broken.

import { DOC_PAGES, pageLinks } from "../src/docs.js";

const USER_AGENT = "CardDiscoveryDev/0.1";
const SPACING_MS = 500;
const WIKI = "https://mtg.fandom.com/wiki/";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Every external link, once, with the pages that use it. */
function collectLinks() {
  const links = new Map();
  for (const page of DOC_PAGES) {
    for (const { href } of pageLinks(page)) {
      if (!href.startsWith("https://")) continue;
      if (!links.has(href)) links.set(href, new Set());
      links.get(href).add(page.id);
    }
  }
  return links;
}

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" });
  return { status: res.status, text: res.ok ? await res.text() : "" };
}

/** Wiki titles that don't exist, through one API request. */
async function missingWikiPages(urls) {
  const titles = urls.map((u) => decodeURIComponent(u.slice(WIKI.length).split("#")[0]).replace(/_/g, " "));
  const api = `https://mtg.fandom.com/api.php?${new URLSearchParams({ action: "query", format: "json", redirects: "1", titles: titles.join("|") })}`;
  const { status, text } = await get(api);
  if (status !== 200) throw new Error(`The MTG Wiki API answered ${status}.`);
  const query = JSON.parse(text).query;
  const renamed = new Map([...(query.normalized ?? []), ...(query.redirects ?? [])].map((r) => [r.to, r.from]));
  return Object.values(query.pages).filter((p) => "missing" in p).map((p) => renamed.get(p.title) ?? p.title);
}

const links = collectLinks();
const wiki = [...links.keys()].filter((u) => u.startsWith(WIKI));
const others = [...links.keys()].filter((u) => !u.startsWith(WIKI));
const broken = [];
const unchecked = [];

for (const title of await missingWikiPages(wiki)) broken.push(`MTG Wiki page "${title}" doesn't exist`);
console.log(`Checked ${wiki.length} MTG Wiki pages.`);

const lastByHost = new Map();
for (const url of others) {
  const host = new URL(url).host;
  const wait = (lastByHost.get(host) ?? 0) + SPACING_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastByHost.set(host, Date.now());
  const where = [...links.get(url)].join(", ");
  try {
    const { status, text } = await get(url);
    const fragment = new URL(url).hash.slice(1);
    if (status === 403 || status === 429) unchecked.push(`${status} ${url} (${where})`);
    else if (status >= 400) broken.push(`${status} ${url} (${where})`);
    else if (fragment && !new RegExp(`id=["']${fragment}["']|href=["']#${fragment}["']`).test(text)) broken.push(`no #${fragment} on ${url} (${where})`);
    else console.log(`ok  ${url}`);
  } catch (e) {
    broken.push(`${e.message} ${url} (${where})`);
  }
}

for (const u of unchecked) console.log(`UNCHECKED ${u}: the site blocks scripts. Open it in a browser.`);
for (const b of broken) console.log(`BROKEN ${b}`);
console.log(`\n${links.size} links: ${broken.length} broken, ${unchecked.length} unchecked.`);
process.exit(broken.length ? 1 : 0);
