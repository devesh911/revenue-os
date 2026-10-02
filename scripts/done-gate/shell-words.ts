// Reads a shell command line as the simple commands it runs, and each one from the program it really runs: enough
// to see what a command runs, not a shell.

import { join } from "node:path";

/**
 * PURE: a shell command line → its simple commands, as words with quotes and escapes removed. Enough to see
 * what a command runs, not a shell: `;`, `&`, `|`, new lines and `(…)` separate commands, and a heredoc's body
 * and a case arm's patterns (`a|b)`) are text, not commands. A substitution (`$(…)`, backquotes, `<(…)`, `>(…)`)
 * runs a command line of its own, even inside double quotes or an unquoted heredoc: its commands come first
 * (nested ones too), and its text stays in the word that holds it. `${…}` is text to its closing brace: a `<<` in
 * it starts no heredoc, and an assignment before the program (`id=${r%% *}`) stays one word across its spaces;
 * anywhere else they end a word, as bash splits what it expands to. A comment's quotes are text, so they can't
 * hide the lines after it, and its words are read as commands all the same, as zsh -i runs them.
 */
export function simpleCommands(line: string): string[][] {
  return read(line, 0, "").commands;
}

// Words that may come before the keyword `case`: `if case …`, `! case …`, `{ case …`.
const OPENERS = new Set([
  "!",
  "{",
  "if",
  "then",
  "elif",
  "else",
  "while",
  "until",
  "do",
]);
const ASSIGNMENT = /^[A-Za-z_]\w*=/;
const beforeProgram = (w: string) => ASSIGNMENT.test(w) || KEYWORDS.has(w);

/** Reads `line` from `from` to its end, or to the `stop` that closes a substitution: its commands, and where it stopped. */
function read(line: string, from: number, stop: string) {
  const out: string[][] = [[]];
  const heredocs: { tag: string; expands: boolean }[] = [];
  let word = "";
  let quote = "";
  let inWord = false;
  let plain = true; // no quote, escape or expansion in the word, so a shell may read it as a keyword
  let depth = 0; // parentheses opened inside a $( … )
  // Each ${ still open, and whether it opened inside double quotes. Where one ends turns murky at a bare { inside
  // it (zsh nests it, bash doesn't) or a separator before its }: from there on, no `<<` starts a heredoc.
  const braces: boolean[] = [];
  let murky = false;
  let gaps: number[] = []; // where the word holds a space kept for a ${ that has not closed yet
  let caseAt = -1; // the number of words up to the current command's `case` keyword
  let arm: string[][] | undefined; // a case arm's patterns being read: the commands holding them, emptied at its )
  let leading = false; // no pattern read yet in this arm
  const current = () => out[out.length - 1] ?? [];
  const end = () => {
    const c = current();
    if (inWord) {
      // A ${ that never closed keeps no word across its spaces.
      const words = gaps.length
        ? [...gaps, word.length]
            .map((g, k) => word.slice((gaps[k - 1] ?? -1) + 1, g))
            .filter(Boolean)
        : [word];
      // A pattern is one word, and `esac` in its place ends the case: either way, no pattern.
      if (
        arm &&
        (c.length || words.length > 1 || (leading && plain && word === "esac"))
      )
        arm = undefined;
      c.push(...words);
      leading = false;
      if (
        plain &&
        word === "case" &&
        c.slice(0, -1).every((w) => OPENERS.has(w))
      )
        caseAt = c.length;
      else if (plain && word === "in" && c.length === caseAt + 2) {
        arm = []; // `case WORD in`: the first arm's patterns come next
        leading = true;
        caseAt = -1;
        out.push([]);
      }
    }
    word = "";
    inWord = false;
    plain = true;
    gaps = [];
  };
  const next = () => {
    end();
    caseAt = -1;
    if (current().length) out.push([]);
  };
  // Commands that run before the one being read: a substitution's, which that command waits for.
  const first = (commands: string[][]) =>
    out.splice(out.length - 1, 0, ...commands);
  const substitute = (at: number, open: number, close: string) => {
    const inner = read(line, open, close);
    first(inner.commands);
    word += line.slice(at, inner.end + 1);
    inWord = true;
    plain = false;
    return inner.end;
  };
  // A ; & | ( ) or new line ends the command, and any ${ still open there.
  const separate = () => {
    end();
    if (braces.length) murky = true;
    braces.length = 0;
    next();
  };
  let i = from;
  for (; i < line.length; i++) {
    const ch = line[i] ?? "";
    const endsArm =
      ch === ";" ? line.slice(i, i + 3).match(/^;(;&?|[&|])/)?.[0] : undefined; // ;; ;& ;;& or ;|
    if (quote === "'") {
      if (ch === "'") quote = "";
      else word += ch;
    } else if (ch === "`" && stop === "`") break;
    else if (ch === "\\") {
      word += line[++i] ?? "";
      inWord = true;
      plain = false;
    } else if (ch === "$" && line[i + 1] === "(") i = substitute(i, i + 2, ")");
    else if (ch === "`") i = substitute(i, i + 1, "`");
    else if (ch === "$" && line[i + 1] === "{") {
      braces.push(quote === '"');
      word += "${";
      inWord = true;
      plain = false;
      i++;
    } else if ((ch === "{" || ch === "}") && braces.length) {
      if (ch === "{") {
        murky = true;
        braces.length = 0;
      } else if (braces.at(-1) === (quote === '"')) {
        braces.pop(); // a } in quotes the ${ is not in is text
        if (!braces.length) gaps = [];
      }
      word += ch;
      inWord = true;
    } else if (quote) {
      if (ch === quote) quote = "";
      else word += ch;
    } else if ((ch === "<" || ch === ">") && line[i + 1] === "(")
      i = substitute(i, i + 2, ")");
    else if (line.startsWith("<<<", i) && !braces.length && !murky) {
      end();
      out[out.length - 1]?.push("<<<"); // a here-string: the word after it is text handed to the command
      i += 2;
    } else if (line.startsWith("<<", i) && !braces.length && !murky) {
      const tag = line.slice(i + 2).match(/^-?\s*(['"]?)([\w.-]+)\1/);
      if (tag) heredocs.push({ tag: tag[2] ?? "", expands: !tag[1] });
      i += 1 + (tag?.[0].length ?? 0);
    } else if (ch === "#" && !inWord) {
      // A comment, to the end of its line: its quotes are text, and its words are read as commands.
      const eol = line.indexOf("\n", i);
      next();
      for (const part of line
        .slice(i, eol < 0 ? undefined : eol)
        .split(/[;&|()`]/)) {
        current().push(...part.split(/\s+/).filter(Boolean));
        next();
      }
      i = (eol < 0 ? line.length : eol) - 1;
    } else if (ch === "\n") {
      end();
      if (!leading) arm = undefined; // a pattern ends on its own line
      separate();
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
      plain = false;
    } else if (arm && ch === "(" && leading && !inWord) {
      // the ( a pattern may open with
    } else if (arm && (ch === "|" || ch === ")")) {
      end();
      if (!arm)
        i--; // no pattern after all: read this character again
      else if (ch === "|") {
        arm.push(current());
        next();
      } else {
        for (const c of [...arm, current()]) c.length = 0;
        arm = undefined;
        next();
      }
    } else if (endsArm && !braces.length && !murky) {
      next();
      arm = []; // the next arm's patterns come next
      leading = true;
      i += endsArm.length - 1;
    } else if (ch === ")" && stop === ")" && depth === 0) break;
    else if (";&|()".includes(ch)) {
      arm = undefined;
      depth += ch === "(" ? 1 : ch === ")" ? -1 : 0;
      separate();
    } else if (/\s/.test(ch)) {
      // An assignment before the program goes on to its ${…}'s end: no shell splits what it expands to.
      if (
        braces.length &&
        ASSIGNMENT.test(word) &&
        current().every(beforeProgram)
      ) {
        gaps.push(word.length);
        word += ch;
      } else end();
    } else {
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
