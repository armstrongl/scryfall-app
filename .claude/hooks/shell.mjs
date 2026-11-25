// A small parser for the shell commands that Claude Code runs with the Bash
// tool. It splits a command line into simple commands and their words, with
// quotes removed, and keeps the text of heredocs and here-strings. It is
// enough to find the message of a commit or the body of a pull request. It
// doesn't run anything or expand variables. A command substitution such as
// $(cat <<'EOF' ... EOF) stays in its word as raw text, and the commands
// inside it are returned too.

/**
 * @typedef {object} SimpleCommand
 * @property {string[]} words The words, with quotes removed.
 * @property {string|null} stdin Text from a heredoc or here-string.
 * @property {string|null} stdinFile A file read with "<".
 * @property {SimpleCommand|null} pipedFrom The command whose output is piped in.
 */

/**
 * Parses a command line. Throws on a quote or substitution that isn't closed.
 * @param {string} src
 * @returns {SimpleCommand[]}
 */
export function parseShell(src) {
  const p = { src, i: 0, nested: [] };
  const commands = parseList(p, false);
  return [...commands, ...p.nested];
}

/** Replaces each $(cat <<'EOF' ... EOF) in a shell value with the text it prints. */
export function expandCatHeredocs(value) {
  return value.replace(/\$\(\s*cat\s*<<-?\s*(['"]?)(\w+)\1[ \t]*\n([\s\S]*?)\n[ \t]*\2[ \t]*\n?\s*\)/g, (_, _q, _d, body) => body);
}

function parseList(p, inSub) {
  const { src } = p;
  const commands = [];
  const pending = [];
  let cmd = { words: [], stdin: null, stdinFile: null, pipedFrom: null };
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
  const endCmd = (pipe = false) => {
    endWord();
    const prev = cmd;
    if (cmd.words.length) commands.push(cmd);
    cmd = { words: [], stdin: null, stdinFile: null, pipedFrom: pipe && prev.words.length ? prev : null };
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
    if (c === "|" && src[p.i + 1] !== "|") { endCmd(true); p.i += src[p.i + 1] === "&" ? 2 : 1; continue; }
    if (c === ";" || c === "&" || c === "|") { endCmd(); p.i += src[p.i + 1] === c ? 2 : 1; continue; }
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
      } else if (src[p.i + 1] === "(") { p.i += 2; p.nested.push(...parseList(p, true)); }
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
  p.nested.push(...parseList(p, true));
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
