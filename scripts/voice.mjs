// The voice word lists, in one place. tests/agent-docs.test.js,
// tests/docs.test.js, and scripts/check-pr-text.mjs all import them, so the
// tests and the pull request check can't drift apart. Plain ESM with no DOM
// and no dependencies, so any Node.js script or hook can import it.
// .claude/rules/github-voice.md has the rules these lists enforce.

/** First-person words. Test a line with hasFirstPerson(), which strips quotes and code first. */
export const FIRST_PERSON = /\bI\b|\bI'(?:m|ve|d|ll)\b|\b(?:my|me|myself|mine|we|we're|we've|our|ours|us)\b/i;

/** Proper names that contain a first-person word, such as a page on Commander Spellbook. */
export const NAMES = /Find My Combos/g;

/** Third-person words and roles for the person the app is built for. */
export const THIRD_PERSON = /\bowner(?:'s|s)?\b|\bshe(?:'s)?\b|\bher\b|\bhers\b|\bherself\b|\bthe developer\b|\bLarah\b/i;

/** A Claude Code session link, session trailer, or session ID. Built in parts, so this file doesn't match it. */
export const SESSION = new RegExp(["claude\\.ai/code/" + "session", "Claude-" + "Session:", "session_" + "01[A-Za-z0-9]{10,}"].join("|"), "i");

/** A co-author trailer or a "Generated with" footer at the start of a line. A quote or code span before it means the line only names it. */
export const ATTRIBUTION = /^[^\w"“'`]*(?:co-authored-by:|generated with\b)/i;

/** A line without double-quoted text. */
export const unquoted = (line) => line.replace(/"[^"]*"|“[^”]*”/g, "");

/** A line without URLs, code spans, quoted text, and proper names. */
export const strip = (line) => unquoted(line.replace(/https?:\/\/\S+/g, "").replace(/`[^`]*`/g, "")).replace(NAMES, "").replace(/\bI\/O\b/g, "");

/** True when a line uses the first person outside quotes and code. A lowercase "i" alone doesn't count. */
export const hasFirstPerson = (line) => FIRST_PERSON.test(strip(line).replace(/\bi\b/g, "i_"));

/** True when a line uses the third person outside quotes. */
export const hasThirdPerson = (line) => THIRD_PERSON.test(unquoted(line));

/** True when a line mentions a Claude session, even in quotes or code. */
export const hasSession = (line) => SESSION.test(line);

/** True when a line is a co-author trailer or a "Generated with" footer. */
export const hasAttribution = (line) => ATTRIBUTION.test(line);

/**
 * The voice problems in a block of text, such as a commit message or a
 * pull request description, as "line N: kind: text". Quoted text, code
 * spans, URLs, and fenced code blocks are left out of the person checks,
 * but not the session and attribution checks. With person set to false,
 * only the session and attribution checks run, as for a merge commit.
 * @param {string} text
 * @param {{person?: boolean}} [options]
 * @returns {string[]}
 */
export function voiceProblems(text, { person = true } = {}) {
  const problems = [];
  let fence = null;
  String(text ?? "").replace(/\r\n/g, "\n").split("\n").forEach((line, i) => {
    const at = (kind) => problems.push(`line ${i + 1}: ${kind}: ${line.trim().slice(0, 80)}`);
    const mark = line.trimStart().match(/^(```|~~~)/)?.[1];
    if (hasSession(line)) at("Claude session");
    if (hasAttribution(line)) at("attribution");
    if (mark && (!fence || fence === mark)) { fence = fence ? null : mark; return; }
    if (!person || fence) return;
    if (hasFirstPerson(line)) at("first person");
    if (THIRD_PERSON.test(strip(line))) at("third person");
  });
  return problems;
}
