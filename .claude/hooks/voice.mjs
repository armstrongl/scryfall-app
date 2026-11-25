// The voice rules from .claude/rules/github-voice.md, as checks on one text:
// a commit message, a pull request or issue title or body, or a comment.
// Session and attribution text is blocked everywhere. The first and third
// person are blocked only for this repository, since other repositories have
// their own rules.

// Built in parts, so this file doesn't match the session check in
// tests/agent-docs.test.js.
const SESSION = new RegExp(["claude\\.ai/code/" + "session", "Claude-" + "Session:", "session_" + "01[A-Za-z0-9]{10,}"].join("|"), "i");
const CO_AUTHOR = /^\s*co-authored-by:/im;
const GENERATED = /^[^\w\n]*generated (?:with|by)\b/im;

// The same words as tests/agent-docs.test.js and tests/docs.test.js. "US"
// in capitals is the country, so only the lowercase pronoun counts.
const FIRST_PERSON = /\bI\b|\bI'(?:m|ve|d|ll)\b|\b(?:[Mm]y|[Mm]e|[Mm]yself|[Mm]ine|[Ww]e|[Ww]e're|[Ww]e've|[Oo]ur|[Oo]urs|[Uu]s)\b/;
const THIRD_PERSON = /\bshe(?:'s)?\b|\bher\b|\bhers\b|\bherself\b|\bthe (?:repository |repo |project |app )?owner\b|\bthe developer\b|\bLarah\b/i;

/** A line without links, code spans, quoted words, and names that contain a banned word. */
const strip = (line) => line
  .replace(/https?:\/\/\S+/g, "")
  .replace(/`[^`]*`/g, "")
  .replace(/"[^"]*"|“[^”]*”/g, "")
  .replace(/Find My Combos/g, "")
  .replace(/\bI\/O\b/g, "");

const excerpt = (line) => line.trim().slice(0, 80);

/**
 * The voice problems in one text, as short sentences.
 * @param {string} text
 * @param {{ ownRepo?: boolean }} [opts] ownRepo is false for another repository.
 * @returns {string[]}
 */
export function voiceProblems(text, { ownRepo = true } = {}) {
  const problems = [];
  if (SESSION.test(text)) problems.push("It has a Claude session link, trailer, or ID.");
  if (CO_AUTHOR.test(text)) problems.push("It has a Co-Authored-By line.");
  if (GENERATED.test(text)) problems.push("It has a Generated with footer.");
  if (!ownRepo) return problems;
  let fenced = false;
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced || /^\s*>/.test(line)) continue;
    const plain = strip(line);
    const first = plain.match(FIRST_PERSON);
    if (first) problems.push(`It uses the first person ("${first[0]}"): ${excerpt(line)}`);
    const third = plain.match(THIRD_PERSON);
    if (third) problems.push(`It uses the third person ("${third[0]}"): ${excerpt(line)}`);
  }
  return problems;
}

/** Replaces each $(cat <<'EOF' ... EOF) in a shell value with the text it prints. */
export function expandCatHeredocs(value) {
  return value.replace(/\$\(\s*cat\s*<<-?\s*(['"]?)(\w+)\1[ \t]*\n([\s\S]*?)\n[ \t]*\2[ \t]*\n?\s*\)/g, (_, _q, _d, body) => body);
}
