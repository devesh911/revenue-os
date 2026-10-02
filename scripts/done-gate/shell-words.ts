// Reads a shell command line as the simple commands it runs: enough to see what a command runs, not a shell.

/**
 * PURE: a shell command line → its simple commands, as words with quotes and escapes removed. Enough to see
 * what a command runs, not a shell: `;`, `&`, `|`, new lines, `(…)`, `$(…)` and backquotes separate commands,
 * and a heredoc's body (text, not commands) is skipped.
 */
export function simpleCommands(line: string): string[][] {
  const out: string[][] = [[]];
  const heredocs: string[] = [];
  let word = "";
  let quote = "";
  let inWord = false;
  const end = () => {
    if (inWord) out[out.length - 1]?.push(word);
    word = "";
    inWord = false;
  };
  const next = () => {
    end();
    if (out[out.length - 1]?.length) out.push([]);
  };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? "";
    if (quote) {
      if (ch === quote) quote = "";
      else if (ch === "\\" && quote === '"') word += line[++i] ?? "";
      else word += ch;
    } else if (ch === "<" && line[i + 1] === "<" && line[i + 2] !== "<") {
      const tag = line.slice(i + 2).match(/^-?\s*(['"]?)([\w.-]+)\1/);
      if (tag) {
        heredocs.push(tag[2] ?? "");
        i += 1 + tag[0].length;
      }
    } else if (ch === "\n") {
      next();
      for (const tag of heredocs.splice(0)) {
        let at = i + 1;
        while (at < line.length) {
          const eol = line.indexOf("\n", at);
          const text = line.slice(at, eol < 0 ? undefined : eol);
          at = eol < 0 ? line.length : eol + 1;
          if (text.trim() === tag) break;
        }
        i = at - 1;
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      inWord = true;
    } else if (ch === "\\") {
      word += line[++i] ?? "";
      inWord = true;
    } else if (";&|()`".includes(ch) || (ch === "$" && line[i + 1] === "(")) {
      next();
    } else if (/\s/.test(ch)) end();
    else {
      word += ch;
      inWord = true;
    }
  }
  end();
  return out.filter((c) => c.length);
}

/** A simple command's words from the program on (`VAR=x`, `env`, `command` … dropped; /usr/bin/gh is gh). */
export const program = (words: string[]) => {
  let i = 0;
  while (
    /^[A-Za-z_]\w*=/.test(words[i] ?? "") ||
    ["env", "command", "exec", "time", "nohup", "sudo"].includes(words[i] ?? "")
  )
    i++;
  return words.slice(i).map((w, k) => (k ? w : w.replace(/^.*\//, "")));
};
