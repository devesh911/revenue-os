// Reads a shell command line as the simple commands it runs, and each one from the program it really runs: enough
// to see what a command runs, not a shell.

import { join } from "node:path";

/**
 * PURE: a shell command line → its simple commands, as words with quotes and escapes removed. Enough to see
 * what a command runs, not a shell: `;`, `&`, `|`, new lines and `(…)` separate commands, and a heredoc's body is
 * text, not commands. A substitution (`$(…)`, backquotes, `<(…)`, `>(…)`) runs a command line of its own, even
 * inside double quotes or an unquoted heredoc: its commands come first (nested ones too), and its text stays in
 * the word that holds it.
 */
export function simpleCommands(line: string): string[][] {
  return read(line, 0, "").commands;
}

/** Reads `line` from `from` to its end, or to the `stop` that closes a substitution: its commands, and where it stopped. */
function read(line: string, from: number, stop: string) {
  const out: string[][] = [[]];
  const heredocs: { tag: string; expands: boolean }[] = [];
  let word = "";
  let quote = "";
  let inWord = false;
  let depth = 0; // parentheses opened inside a $( … )
  const end = () => {
    if (inWord) out[out.length - 1]?.push(word);
    word = "";
    inWord = false;
  };
  const next = () => {
    end();
    if (out[out.length - 1]?.length) out.push([]);
  };
  // Commands that run before the one being read: a substitution's, which that command waits for.
  const first = (commands: string[][]) =>
    out.splice(out.length - 1, 0, ...commands);
  const substitute = (at: number, open: number, close: string) => {
    const inner = read(line, open, close);
    first(inner.commands);
    word += line.slice(at, inner.end + 1);
    inWord = true;
    return inner.end;
  };
  let i = from;
  for (; i < line.length; i++) {
    const ch = line[i] ?? "";
    if (quote === "'") {
      if (ch === "'") quote = "";
      else word += ch;
    } else if (ch === "`" && stop === "`") break;
    else if (ch === "\\") {
      word += line[++i] ?? "";
      inWord = true;
    } else if (ch === "$" && line[i + 1] === "(") i = substitute(i, i + 2, ")");
    else if (ch === "`") i = substitute(i, i + 1, "`");
    else if (quote) {
      if (ch === quote) quote = "";
      else word += ch;
    } else if ((ch === "<" || ch === ">") && line[i + 1] === "(")
      i = substitute(i, i + 2, ")");
    else if (line.startsWith("<<<", i)) {
      end();
      out[out.length - 1]?.push("<<<"); // a here-string: the word after it is text handed to the command
      i += 2;
    } else if (line.startsWith("<<", i)) {
      const tag = line.slice(i + 2).match(/^-?\s*(['"]?)([\w.-]+)\1/);
      if (tag) heredocs.push({ tag: tag[2] ?? "", expands: !tag[1] });
      i += 1 + (tag?.[0].length ?? 0);
    } else if (ch === "\n") {
      next();
      for (const { tag, expands } of heredocs.splice(0)) {
        let at = i + 1;
        while (at < line.length) {
          const eol = line.indexOf("\n", at);
          const text = line.slice(at, eol < 0 ? undefined : eol);
          at = eol < 0 ? line.length : eol + 1;
          if (text.trim() === tag) break;
        }
        if (expands) first(substitutionsIn(line.slice(i + 1, at))); // an unquoted tag: the body is double-quoted text
        i = at - 1;
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      inWord = true;
    } else if (ch === ")" && stop === ")" && depth === 0) break;
    else if (";&|()".includes(ch)) {
      depth += ch === "(" ? 1 : ch === ")" ? -1 : 0;
      next();
    } else if (/\s/.test(ch)) end();
    else {
      word += ch;
      inWord = true;
    }
  }
  end();
  return { commands: out.filter((c) => c.length), end: i };
}

/** The commands an unquoted heredoc's body runs: its substitutions. The rest of it is text. */
function substitutionsIn(text: string) {
  const found: string[][] = [];
  for (let k = 0; k < text.length; k++) {
    if (text[k] === "\\") k++;
    else if (text.startsWith("$(", k) || text[k] === "`") {
      const tick = text[k] === "`";
      const inner = read(text, k + (tick ? 1 : 2), tick ? "`" : ")");
      found.push(...inner.commands);
      k = inner.end;
    }
  }
  return found;
}

// Words that open or close a compound command, not the program it runs.
const KEYWORDS = new Set([
  "if",
  "then",
  "elif",
  "else",
  "fi",
  "while",
  "until",
  "do",
  "done",
  "esac",
  "!",
  "{",
  "}",
]);
// Programs that run the rest of their words as a command, and the options of each that take a value.
const WRAPPERS = new Map([
  ["env", ["-u", "--unset", "-C", "--chdir", "-P"]],
  ["exec", ["-a"]],
  ["time", ["-f", "--format", "-o", "--output"]],
  ["command", []],
  [
    "sudo",
    ["-u", "--user", "-g", "--group", "-h", "-p", "-C", "-D", "-R", "-T"],
  ],
  ["nice", ["-n", "--adjustment"]],
  ["stdbuf", ["-i", "--input", "-o", "--output", "-e", "--error"]],
  ["timeout", ["-s", "--signal", "-k", "--kill-after"]],
  ["caffeinate", ["-t", "-w"]],
  ["arch", ["-arch"]],
  ["nohup", []],
  ["busybox", []],
  ["npx", ["-p", "--package"]],
  ["bunx", ["-p", "--package"]],
]);

/**
 * PURE: a simple command's words from the program it really runs on (/usr/bin/gh is gh). Dropped before it:
 * `VAR=x` words, shell keywords (`if`, `do`, `!`, `{` …), `function NAME`, `bun run local` (the repo's own
 * wrapper) and wrappers with their options (`env -i`, `timeout -s KILL 60`, `nice -n 5` …); `env -S '…'` is read
 * as the words it splits. Nothing for a `for`, `select` or `case` header, whose words are a list, or for
 * `command -v`, a lookup.
 */
export function program(words: string[]): string[] {
  let i = 0;
  for (;;) {
    const w = words[i] ?? "";
    if (/^[A-Za-z_]\w*=/.test(w) || KEYWORDS.has(w)) i++;
    else if (w === "function") i += 2;
    else if (w === "bun" && words[i + 1] === "run" && words[i + 2] === "local")
      i += 3;
    else if (
      ["for", "select", "case"].includes(w) ||
      (w === "command" && /^-\w*[vV]/.test(words[i + 1] ?? ""))
    )
      return [];
    else if (WRAPPERS.has(w)) {
      const valued = WRAPPERS.get(w) ?? [];
      for (i++; /^-./.test(words[i] ?? ""); i++) {
        const option = words[i] ?? "";
        const split =
          w === "env" ? option.match(/^(?:-S|--split-string=?)(.*)$/s) : null;
        if (split)
          return program([
            ...(simpleCommands(split[1] || (words[++i] ?? ""))[0] ?? []),
            ...words.slice(i + 1),
          ]);
        if (option === "--") {
          i++;
          break;
        }
        if (valued.includes(option)) i++;
      }
      if (w === "timeout") i++; // its duration
    } else break;
  }
  return words.slice(i).map((w, k) => (k ? w : w.replace(/^.*\//, "")));
}

/** A simple command's words without its redirections (`> out`, `2>&1`, `<in`, `<<< text`), which are not its arguments. */
export const unredirected = (words: string[]) =>
  words.filter(
    (w, i) => !/^\d*[<>]/.test(w) && !/^\d*[<>]+&?$/.test(words[i - 1] ?? ""),
  );

/** The words no option owns, in order; each option in `valued` owns the word after it. */
export const positionals = (args: string[], valued: string[] = []) =>
  args.filter((a, i) => !/^-./.test(a) && !valued.includes(args[i - 1] ?? ""));

/** The folder `cd <to>` or `git -C <to>` moves to from `dir` ("" is where the command starts). */
export const into = (dir: string, to: string) =>
  /^[/~]/.test(to) ? to : join(dir, to);

/** The git subcommand a simple command runs, the words after it, and the folders `git -C` moves to, if it runs git. */
export const gitOf = (words: string[]) => {
  const w = program(words);
  if (w[0] !== "git") return;
  const dirs: string[] = [];
  let i = 1;
  while ((w[i] ?? "").startsWith("-")) {
    if (w[i] === "-C") dirs.push(w[i + 1] ?? "");
    i += ["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(
      w[i] ?? "",
    )
      ? 2
      : 1;
  }
  return { sub: w[i], args: w.slice(i + 1), dirs };
};
