// A small parser for the shell commands that Claude Code runs with the Bash
// tool. It splits a command line into simple commands and their words, with
// quotes removed, and keeps the text of heredocs and here-strings. It is
// enough to find the message of a commit or the body of a pull request. It
// doesn't run anything or expand variables. Command substitutions such as
// $(cat <<'EOF' ... EOF) stay in a word as their raw text.

/**
 * @typedef {object} SimpleCommand
 * @property {string[]} words The words, with quotes removed.
 * @property {string|null} stdin Text from a heredoc or here-string.
 * @property {string|null} stdinFile A file read with "<".
 */

/**
 * Parses a command line. Throws on a quote or substitution that isn't closed.
 * @param {string} src
 * @returns {SimpleCommand[]}
 */
export function parseShell(src) {
  const p = { src, i: 0 };
  return parseList(p, false);
}

function parseList(p, inSub) {
  const { src } = p;
  const commands = [];
  const pending = [];
  let cmd = { words: [], stdin: null, stdinFile: null };
  let word = null;
  let expect = null;
  let hereStrip = false;

  const endWord = () => {
    if (word === null) return;
    const role = expect;
    expect = null;
    if (role === "in") cmd.stdinFile = word;
    else if (role === "herestring") cmd.stdin = word;
    else if (role === "heredoc") pending.push({ delim: word, strip: hereStrip, cmd });
    else if (role !== "out") cmd.words.push(word);
    word = null;
  };
  const endCmd = () => {
    endWord();
    if (cmd.words.length) commands.push(cmd);
    cmd = { words: [], stdin: null, stdinFile: null };
  };
  const readHeredocs = () => {
    for (const h of pending.splice(0)) {
      const body = [];
      while (p.i < src.length) {
        const nl = src.indexOf("\n", p.i);
        const line = src.slice(p.i, nl < 0 ? src.length : nl);
        p.i = nl < 0 ? src.length : nl + 1;
        if ((h.strip ? line.replace(/^\t+/, "") : line) === h.delim) break;
        body.push(h.strip ? line.replace(/^\t+/, "") : line);
      }
      h.cmd.stdin = body.join("\n");
    }
  };

  while (p.i < src.length) {
    const c = src[p.i];
    if (c === ")" && inSub) { endCmd(); p.i++; return commands; }
    if (c === "\n") { endCmd(); p.i++; readHeredocs(); continue; }
    if (c === " " || c === "\t") { endWord(); p.i++; continue; }
    if (c === "#" && word === null) {
      while (p.i < src.length && src[p.i] !== "\n") p.i++;
      continue;
    }
    if (c === ";" || c === "&" || c === "|") { endCmd(); p.i++; continue; }
    if (c === "(" && word === null) { endCmd(); p.i++; commands.push(...parseList(p, true)); continue; }
    if (c === ")") { endCmd(); p.i++; continue; }
    if (c === "<") {
      endWord();
      if (src.startsWith("<<<", p.i)) { expect = "herestring"; p.i += 3; }
      else if (src.startsWith("<<", p.i)) {
        p.i += 2;
        hereStrip = src[p.i] === "-";
        if (hereStrip) p.i++;
        expect = "heredoc";
      } else if (src[p.i + 1] === "(") { p.i += 2; parseList(p, true); }
      else { expect = "in"; p.i++; }
      continue;
    }
    if (c === ">") {
      if (word !== null && /^\d+$/.test(word)) word = null;
      endWord();
      p.i++;
      if (src[p.i] === ">" || src[p.i] === "|") p.i++;
      if (src[p.i] === "&") p.i++;
      expect = "out";
      continue;
    }
    if (word === null) word = "";
    if (c === "\\") {
      if (src[p.i + 1] !== "\n") word += src[p.i + 1] ?? "";
      p.i += 2;
    } else if (c === "'") {
      const end = src.indexOf("'", p.i + 1);
      if (end < 0) throw new Error("unclosed single quote");
      word += src.slice(p.i + 1, end);
      p.i = end + 1;
    } else if (c === "$" && src[p.i + 1] === "'") {
      word += readAnsiC(p);
    } else if (c === '"') {
      word += readDouble(p);
    } else if (c === "$" && src[p.i + 1] === "(") {
      word += readSubst(p);
    } else if (c === "`") {
      word += readBackticks(p);
    } else {
      word += c;
      p.i++;
    }
  }
  if (inSub) throw new Error("unclosed substitution");
  endCmd();
  readHeredocs();
  return commands;
}

function readDouble(p) {
  const { src } = p;
  let out = "";
  p.i++;
  while (p.i < src.length) {
    const c = src[p.i];
    if (c === '"') { p.i++; return out; }
    if (c === "\\" && "$`\"\\\n".includes(src[p.i + 1])) {
      if (src[p.i + 1] !== "\n") out += src[p.i + 1];
      p.i += 2;
    } else if (c === "$" && src[p.i + 1] === "(") {
      out += readSubst(p);
    } else if (c === "`") {
      out += readBackticks(p);
    } else {
      out += c;
      p.i++;
    }
  }
  throw new Error("unclosed double quote");
}

function readSubst(p) {
  const start = p.i;
  p.i += 2;
  parseList(p, true);
  return p.src.slice(start, p.i);
}

function readBackticks(p) {
  const end = p.src.indexOf("`", p.i + 1);
  if (end < 0) throw new Error("unclosed backtick");
  const raw = p.src.slice(p.i, end + 1);
  p.i = end + 1;
  return raw;
}

const ESCAPES = { n: "\n", t: "\t", r: "\r", "\\": "\\", "'": "'", '"': '"' };

function readAnsiC(p) {
  const { src } = p;
  let out = "";
  p.i += 2;
  while (p.i < src.length) {
    const c = src[p.i];
    if (c === "'") { p.i++; return out; }
    if (c === "\\") { out += ESCAPES[src[p.i + 1]] ?? "\\" + (src[p.i + 1] ?? ""); p.i += 2; }
    else { out += c; p.i++; }
  }
  throw new Error("unclosed $' quote");
}
