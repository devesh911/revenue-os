// The done gate: an agent may not stop while its change is unproven. Claude Code and Codex run it from
// their hooks (.claude/settings.json, .codex/hooks.json); CI runs its rules on every pull request; a human
// runs `bun run gate`.
//
//   bun run gate                                  the rules below + every check, on the code as it stands
//   bun run gate rules [--base <ref>]             only the rules, on the change since HEAD left <ref> (origin/main)
//   bun run gate tests [e2e]                      bun's tests (or the browser checks); fails if any test didn't run
//   bun run gate pause "<question>"               the next stop asks Devesh something; it is not "done"
//   bun run gate verdict pass|fail "<what you saw>"   the verifier agent's ruling, or
//   bun run gate verdict cannot-verify "<what only Devesh can provide>"
//   bun run see /o/:org/contacts [more paths]     sign in as the dev login; save what each page shows
//
// A stop passes when the session changed nothing, or when (1) the change against main breaks none of
// the rules below, (2) every check is green on this exact code, and (3) if product code changed, the
// verifier agent (and only it) ruled PASS on this exact code, or CANNOT_VERIFY naming what only Devesh
// can provide (he is told it is NOT verified). Codex has no verifier agent, so its green product change
// stops once, marked NOT independently verified. Results are kept per code state in .git/done-gate, so
// the same code is never checked twice.
import { spawnSync } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  existsSync,
  fstatSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { type AddressInfo, createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Hooks can start with a bare PATH; bun, supabase, psql and docker live in these.
process.env.PATH = [
  dirname(process.execPath),
  "/opt/homebrew/bin",
  "/usr/local/bin",
  process.env.PATH,
].join(":");

const MAX_BLOCKS = 5; // then the agent may stop, shown to Devesh as NOT DONE (Claude Code's own cap is 8)
const PRODUCT =
  /^(apps|services|packages)\/[^/]+\/src\/|^supabase\/(migrations|seed)/;
const TEST =
  /[._](test|spec)\.[cm]?[jt]sx?$|\.e2e\.[cm]?[jt]sx?$|(^|\/)(tests?|e2e|__tests__)\//;
const CODE = /\.[cm]?[jt]sx?$/;
const EXPORT =
  /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([\w$]+)/;
// A string literal naming source code: a src/ path, or a file ending .ts/.tsx/.js/.jsx.
const SOURCE_PATH =
  /["'`](?:[^"'`\n]*\/)?(?:src(?:\/[^"'`\n]*)?|[^"'`\n]+\.[cm]?[jt]sx?)["'`]/;
// Files that decide what "done" means. Changing them is allowed; Devesh is told every time, and
// .github/CODEOWNERS makes him review each one.
export const RULE_FILES =
  /^(\.github\/|\.codex\/|\.claude\/(settings\.json|agents\/)|scripts\/(guards\.sh|done-gate)|tests\/rls_coverage\.sql|package\.json$|bunfig\.toml$|(apps\/[^/]+\/)?(biome|tsconfig[^/]*)\.json$|apps\/console\/playwright\.config\.ts$)/;
const ALLOW = "done-gate: allow";
// In a test file, a test switched off or singled out: skip/only/todo, their conditional forms (skipIf, runIf,
// todoIf, if), Playwright's fixme and fail, bun's failing, after any modifiers (concurrent, serial, describe),
// called or picked as a value (`cond ? describe : describe.skip`, test["skip"]), and xit/xtest/xdescribe. The
// runner's name is captured, so a line's own variable of that name (`(it) => it.skip`) is left alone. What no
// pattern sees (an alias, a destructured skip) the tests check still catches: see MAY_SKIP.
const SKIP =
  /(?<![\w$.!])(it|test|describe)(?:\s*\.\s*[\w$]+)*?\s*(?:\.\s*|\[\s*["'`])(?:skip|only|todo|skipIf|runIf|todoIf|if|fixme|fail|failing)\b|\bx(?:it|test|describe)\b/g;
// Tests allowed not to run, as "file > name", and why. Any other test that bun or Playwright reports as skipped
// or todo fails the tests or browser checks (`bun run gate tests`), however it was switched off.
const MAY_SKIP: Record<string, string> = {
  "scripts/dev-login.test.ts > creates the dev user via /auth/v1/signup with the anon key when absent":
    "it runs only where the dev login does not exist yet, as in CI",
};
const LOCK_POLL_MS = 200;
const LOCK_WAIT_MS = 30 * 60_000; // then the check fails, naming the holder (the Stop hooks allow an hour)

type Added = { file: string; line: number; text: string };
type Snap = {
  repo: string;
  tree: string;
  files: string[];
  added: Added[];
  users: Map<string, string[]>;
};
type Check = {
  name: string;
  cmd: [string, ...string[]];
  db?: true;
  browser?: true;
};
type Proof =
  | { ok: true; checks: string; notes: string[] }
  | { ok: false; headline: string; reason: string };
type Ruling = { verdict: "pass" | "fail" | "cannot-verify"; note: string };
type HookInput = {
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  agent_type?: string;
  background_tasks?: unknown[];
  session_crons?: unknown[];
};

const CHECKS: Check[] = [
  { name: "typecheck", cmd: ["bun", "run", "typecheck"] },
  { name: "lint", cmd: ["bun", "run", "lint"] },
  { name: "guards", cmd: ["bun", "run", "guards"] },
  {
    name: "tests",
    cmd: ["bun", "run", "local", "bun", "run", "gate", "tests"],
    db: true,
  },
  { name: "database policies", cmd: ["bun", "run", "rls:check"], db: true },
  {
    name: "browser checks",
    cmd: ["bun", "run", "local", "bun", "run", "gate", "tests", "e2e"],
    db: true,
    browser: true,
  },
];

const NEED_VERIFIER = `You can't finish yet: product code changed, and nobody independent has seen it work.
Run the verifier agent (Agent tool, subagent_type "verifier"). Give it Devesh's request word for word, what you changed, and how you believe it can be seen working. If it rules FAIL, fix what it found and run it again.
If you are stopping to ask Devesh a question rather than finishing, run \`bun run gate pause "<the question>"\` and stop again.`;

/** PURE: `git diff --unified=0` → the files it touches and every line it adds. */
export function parseDiff(diff: string): { files: string[]; added: Added[] } {
  const files: string[] = [];
  const added: Added[] = [];
  let line = 0;
  let header = false;
  for (const l of diff.split("\n")) {
    const file = l.match(/^diff --git a\/.+ b\/(.+)$/)?.[1];
    const hunk = l.match(/^@@ -\S+ \+(\d+)/)?.[1];
    if (file) {
      files.push(file);
      header = true;
    } else if (hunk) {
      line = Number(hunk);
      header = false;
    } else if (!header && l.startsWith("+")) {
      added.push({ file: files.at(-1) ?? "", line: line++, text: l.slice(1) });
    }
  }
  return { files, added };
}

/**
 * PURE: the change's added lines → problems that block a stop, and notes Devesh should see.
 * `usersOf(name, file)` lists the files that use an export: other files, plus `file` itself when the
 * name is used there beyond its declaration.
 */
export function checkRules(
  files: string[],
  added: Added[],
  usersOf: (name: string, file: string) => string[],
): { problems: string[]; notes: string[] } {
  const problems: string[] = [];
  const notes: string[] = [];
  const stubListed = added.some(
    (a) => a.file === "STATE.md" && /\|\s*Stub\s*\|/.test(a.text),
  );
  // A test that reads files AND names a source path (outside its imports) is reading code as text.
  const readsSource = new Set(
    added
      .filter(
        (a) =>
          TEST.test(a.file) &&
          SOURCE_PATH.test(a.text) &&
          !/^\s*(import|export)\b|\bfrom\s+["'`]|\b(require|import)\s*\(|mock\.module\s*\(/.test(
            a.text,
          ),
      )
      .map((a) => a.file),
  );
  for (const a of added) {
    if (!CODE.test(a.file) || a.file.startsWith("scripts/done-gate")) continue; // this file quotes what it bans
    const explained = a.text.match(
      /(?:biome-ignore\S*|@ts-expect-error)\s*:?\s*(.*)$/,
    );
    if (explained)
      notes.push(
        `checker silenced at ${a.file}:${a.line}: ${explained[1] || "(no reason given)"}`,
      );
    const problem = lineProblem(
      a,
      stubListed,
      readsSource.has(a.file),
      usersOf,
    );
    if (!problem) continue;
    // The reason after the marker; a ")" it didn't open closed "(done-gate: allow …)" around it.
    const raw = a.text
      .split(ALLOW)[1]
      ?.replace(/\*\/\s*$/, "")
      .trim();
    const why =
      raw && raw.split(")").length > raw.split("(").length
        ? raw.slice(0, raw.lastIndexOf(")")).trim()
        : raw;
    if (why === undefined) problems.push(`${a.file}:${a.line} ${problem}`);
    else
      notes.push(`exception at ${a.file}:${a.line}${why ? ` (${why})` : ""}`);
  }
  const rules = files.filter((f) => RULE_FILES.test(f));
  if (rules.length)
    notes.push(`changed what "done" means: ${rules.join(", ")}`);
  return { problems, notes };
}

function lineProblem(
  { file, text }: Added,
  stubListed: boolean,
  readsSource: boolean,
  usersOf: (name: string, file: string) => string[],
) {
  if (/@ts-(ignore|nocheck)\b/.test(text))
    return "switches the type checker off without a reason; fix the cause instead";
  if (TEST.test(file) && skips(text))
    return "skips or singles out a test; every test must run";
  if (TEST.test(file))
    return readsSource &&
      /\b(readFileSync|readFile|Bun\.file)\s*\(/.test(text) &&
      !/fixture|\.(json|sql|csv|toml|ya?ml|txt)\b/.test(text)
      ? "reads source code as text; test what the code does (render it, call it, drive it), not what it says"
      : undefined;
  if (!PRODUCT.test(file)) return;
  if (
    !stubListed &&
    /\bthrow\b.*\b(not (yet )?(implemented|wired)|unimplemented|stub)\b|\bnot(Wired|Implemented)\s*\(/i.test(
      text,
    )
  )
    return "adds a placeholder that throws; build the real thing, or list it as Stub in STATE.md → What works today in this same change";
  const name = text.match(EXPORT)?.[1];
  if (name && !usersOf(name, file).some((f) => !TEST.test(f)))
    return `exports ${name}, but nothing outside tests uses it; land it together with the code that calls it`;
}

/** PURE: does this added line switch a test off? A line that starts with "*" is inside a comment, up to its end. */
const skips = (line: string) => {
  const code = uncommented(line.replace(/^\s*(?=\*).*?(?:\*\/|$)/, ""));
  return [...code.matchAll(SKIP)].some(
    ([, runner]) =>
      !runner ||
      !new RegExp(
        `\\b(?:const|let|var)\\s+${runner}\\b|\\b${runner}\\s*\\)?\\s*=>`,
      ).test(code),
  );
};

const reEscape = (s: string) => s.replace(/\$/g, "\\$");
const modulePath = (p: string) =>
  p.replace(/\.[cm]?[jt]sx?$/, "").replace(/\/index$/, "");
const STAR_FROM = /\bexport\s*\*\s*(?:as\s+[\w$]+\s*)?from\s*["']([^"']+)["']/g;

/**
 * PURE: code without comments, read in one pass so "image/*" stays a string. A comment starts a line or follows
 * a space, "{" or "(", so a regex such as /a\// hides nothing; one left open runs to the end. A quote right after
 * a letter is an apostrophe in JSX text (Don't), never a string. `blank` empties "…" and '…' too; `…` stays, it
 * holds ${uses}.
 */
const uncommented = (source: string, blank = false) =>
  source.replace(
    /(?<![\w$])(["'])(?:\\.|(?!\1)[^\\\n])*\1|`(?:\\[\s\S]|[^\\`])*`|(?<![^\s{(])\/\*[\s\S]*?(?:\*\/|$)|(?<![^\s{(])\/\/.*/g,
    (m) => (m[0] === "/" ? "" : blank && m[0] !== "`" ? '""' : m),
  );

/** PURE: can `spec`, imported by `from`, be `file`? A path must lead to it or its folder; a package name or alias only into its packages/<name>. */
function leadsTo(spec: string, from: string, file: string) {
  if (!spec.startsWith(".")) {
    const pkg = file.match(/^packages\/([^/]+)\//)?.[1];
    return !!pkg && new RegExp(`(^|[/@])${pkg}(/|$)`).test(spec);
  }
  const target = modulePath(join(dirname(from), spec));
  return target === modulePath(file) || target === dirname(file);
}

/**
 * PURE: does `source`, the text of `from`, use `name`, which `file` exports? Another file must import or
 * re-export it by name (any import block, beside a default import, renamed or not) from a module that can be
 * `file` or one of its `barrels` (modules that `export *` from it), read it as ns.name, destructure it or hand ns
 * on whole after `import * as ns` of it, or name it after an import() or require() of it. `file` itself must use it
 * beyond its declaration (a ternary branch and a `case` count), not as a property, an object key or a
 * parameter. A word that merely matches is no use.
 */
export function usesExport(
  source: string,
  from: string,
  file: string,
  name: string,
  barrels: string[] = [],
): boolean {
  const bare = uncommented(source, true); // for uses; `code` keeps the strings that name modules
  const id = `(?<![\\w$.])${reEscape(name)}(?![\\w$])`;
  if (from === file)
    return new RegExp(`(?<=(?:\\?|\\bcase)\\s*)${id}|${id}(?!\\s*\\??:)`).test(
      bare.replace(
        new RegExp(
          `^export\\s+(?:async\\s+)?(?:function\\*?|const|let|class)\\s+${id}`,
          "m",
        ),
        "",
      ),
    );
  const code = uncommented(source);
  const into = (spec: string) =>
    [file, ...barrels].some((t) => leadsTo(spec, from, t));
  // ns.name, where ns is `import * as ns`, or a namespace re-exported by name (`export * as voice`, then
  // `import { voice }`, then voice.place()).
  const member = (ns: string) =>
    new RegExp(
      `(?<![\\w$.])${reEscape(ns)}\\s*\\??\\.\\s*${reEscape(name)}(?![\\w$])`,
    ).test(bare);
  // ns itself, handed on whole (passed, returned, spread, re-exported, a ternary branch) or destructured with this
  // name or ...rest; not as an object key or type member (`ns:`) or a JSX attribute (`ns=`).
  const whole = (ns: string) =>
    [
      ...bare.matchAll(
        new RegExp(
          `(?<![\\w$.])(?<!\\bas\\s+)${reEscape(ns)}(?![\\w$])(?!\\s*(?:\\??\\.|=(?!=)))`,
          "g",
        ),
      ),
    ].some(({ index = 0 }) => {
      const before = bare.slice(0, index);
      const keys = before.match(/\{([^{}]*)\}\s*=\s*$/)?.[1];
      if (keys !== undefined)
        return keys.split(",").some((k) => {
          const key = k.trim().split(/\s*[:=]/)[0] ?? "";
          return key === name || key.startsWith("...");
        });
      return (
        !/^\s*\??:/.test(bare.slice(index + ns.length)) ||
        /(?:\?|\bcase)\s*$/.test(before)
      );
    });
  for (const [, list = "", spec = ""] of code.matchAll(
    /\b(?:import|export)\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g,
  ))
    if (
      into(spec) &&
      list.split(",").some((s) => {
        const [imported = "", local = imported] = s
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/);
        return imported === name || (local !== "" && member(local));
      })
    )
      return true;
  for (const [, ns = "", spec = ""] of code.matchAll(
    /\bimport\s+(?:[\w$]+\s*,\s*)?\*\s+as\s+([\w$]+)\s+from\s*["']([^"']+)["']/g,
  ))
    if (into(spec) && (member(ns) || whole(ns))) return true;
  return [
    ...code.matchAll(/\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g),
  ].some(
    ([, spec = ""]) =>
      into(spec) &&
      new RegExp(`(?<![\\w$])${reEscape(name)}(?![\\w$])`).test(bare),
  );
}

function git(
  cwd: string,
  args: string[],
  env: Record<string, string> = {},
  mayFail = false,
): string {
  const r = spawnSync("git", args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 256 << 20,
  });
  if (r.status !== 0 && !mayFail)
    throw new Error(`git ${args[0]} failed: ${r.stderr.trim()}`);
  return r.status === 0 ? r.stdout.trim() : "";
}

function stateDir(repo: string): string {
  const dir = join(
    git(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
    "done-gate",
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * The exact code in the worktree (tracked + untracked, minus ignored) as a tree id, plus its diff from where
 * HEAD left `base`. Without a `base`, origin/main, or HEAD in a checkout that has none.
 */
function snapshot(repo: string, withDiff = true, base?: string): Snap {
  const index = join(stateDir(repo), `index-${process.pid}`);
  const real = git(repo, [
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    "index",
  ]);
  if (existsSync(real)) {
    copyFileSync(real, index); // reuse git's file-stat cache: `add -A` stays fast
    // With the index's own age, which tells git what to re-read: a same-size edit in the second it was written.
    const written = Math.floor(statSync(real).mtimeMs / 1000);
    utimesSync(index, written, written);
  }
  const env = { GIT_INDEX_FILE: index };
  try {
    git(repo, ["add", "-A"], env);
    const tree = git(repo, ["write-tree"], env);
    if (!withDiff)
      return { repo, tree, files: [], added: [], users: new Map() };
    const from = base
      ? git(repo, ["merge-base", "HEAD", base])
      : git(repo, ["merge-base", "HEAD", "origin/main"], {}, true) || "HEAD";
    const diffArgs = [
      "-c",
      "core.quotePath=off",
      "diff",
      "--cached",
      "--unified=0",
      "--no-color",
      "--no-renames",
    ];
    const { files, added } = parseDiff(
      git(repo, [...diffArgs, "--no-ext-diff", from], env),
    );
    const users = new Map<string, string[]>(); // "file name" → files using the export
    const texts = new Map<string, string>();
    const read = (f: string) => {
      if (!texts.has(f))
        try {
          texts.set(f, readFileSync(join(repo, f), "utf8"));
        } catch {
          texts.set(f, ""); // e.g. a symlink to a folder
        }
      return texts.get(f) ?? "";
    };
    // Files holding a string: only candidates, usesExport decides.
    const grep = (s: string, word = false) =>
      git(
        repo,
        ["-c", "core.quotePath=off", "grep", "--cached", "-lIF"]
          .concat(word ? ["-w"] : [])
          .concat(["-e", s]),
        env,
        true,
      )
        .split("\n")
        .filter(Boolean);
    let stars: [string, string[]][] | undefined; // files that `export * from`, and from where
    let namespaced: string[] | undefined; // files that may `import * as`
    for (const { file, text } of added) {
      const name = text.match(EXPORT)?.[1];
      if (!name || users.has(`${file} ${name}`)) continue;
      stars ??= grep("export *").map((f) => [
        f,
        [...uncommented(read(f)).matchAll(STAR_FROM)].map((m) => m[1] ?? ""),
      ]);
      const reach = [file]; // file, then every barrel that re-exports it, however deep
      for (const to of reach)
        for (const [b, specs] of stars)
          if (!reach.includes(b) && specs.some((s) => leadsTo(s, b, to)))
            reach.push(b);
      namespaced ??= grep("* as");
      users.set(
        `${file} ${name}`,
        [...new Set([...grep(name, true), ...namespaced])].filter((f) =>
          usesExport(read(f), f, file, name, reach.slice(1)),
        ),
      );
    }
    return { repo, tree, files, added, users };
  } finally {
    rmSync(index, { force: true });
  }
}

class Store {
  constructor(private readonly dir: string) {}
  private file(kind: string, key: string) {
    mkdirSync(join(this.dir, kind), { recursive: true });
    return join(this.dir, kind, key.replace(/[^\w.-]/g, "_"));
  }
  get(kind: string, key: string) {
    const f = this.file(kind, key);
    return existsSync(f) ? readFileSync(f, "utf8") : undefined;
  }
  put(kind: string, key: string, value: string) {
    writeFileSync(this.file(kind, key), value);
  }
  take(kind: string, key: string) {
    const value = this.get(kind, key);
    rmSync(this.file(kind, key), { force: true });
    return value;
  }
}

const reachable = (port: number) =>
  new Promise<boolean>((done) => {
    const s = createConnection({ port, host: "127.0.0.1", timeout: 500 });
    const end = (up: boolean) => {
      s.destroy();
      done(up);
    };
    s.once("connect", () => end(true));
    s.once("error", () => end(false));
    s.once("timeout", () => end(false));
  });

const freePort = () =>
  new Promise<number>((done) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => done(port));
    });
  });

function run(
  repo: string,
  [bin, ...args]: [string, ...string[]],
  env: Record<string, string> = {},
) {
  const r = spawnSync(bin, args, {
    cwd: repo,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 256 << 20,
  });
  return {
    status: r.status ?? 1,
    out: Bun.stripANSI(`${r.stdout ?? ""}${r.stderr ?? ""}`),
  };
}

/**
 * Every worktree of this repo shares one local stack (one database, the console preview on port 4173), so
 * whatever uses it runs one at a time. The lock file names its holder's process; after `waitMs` a waiter
 * gives up, naming the holder.
 */
export async function onSharedStack<T>(
  repo: string,
  work: () => T | Promise<T>,
  waitMs = LOCK_WAIT_MS,
): Promise<T> {
  const lock = join(stateDir(repo), "local-stack.lock");
  const giveUp = Date.now() + waitMs;
  while (!takeLock(lock)) {
    if (Date.now() > giveUp) {
      let holder = "unknown";
      try {
        holder = readFileSync(lock, "utf8").trim();
      } catch {}
      throw new Error(
        `the local stack (one database, port 4173) is still busy after ${Math.round(waitMs / 60_000)} minutes, held by process ${holder}. If that process is stuck, stop it; if it no longer runs, delete ${lock}.`,
      );
    }
    await Bun.sleep(LOCK_POLL_MS);
  }
  try {
    return await work();
  } finally {
    rmSync(lock, { force: true });
  }
}

const errno = (e: unknown) => (e as NodeJS.ErrnoException).code;

/**
 * One try at the lock; true when this process now holds it. A lock appears whole, holder's id inside (a hard
 * link of a written file). A stale one is replaced only by the waiter whose claim, a hard link to that very
 * file, it managed to create: every other waiter's claim fails or points at a newer lock.
 */
function takeLock(lock: string): boolean {
  const mine = `${lock}.${process.pid}.${Math.random().toString(36).slice(2)}`;
  writeFileSync(mine, String(process.pid));
  try {
    try {
      linkSync(mine, lock);
      return true;
    } catch (e) {
      if (errno(e) !== "EEXIST") throw e;
    }
    let fd: number;
    try {
      fd = openSync(lock, "r"); // held open, so its inode number can't be reused while we judge it
    } catch (e) {
      if (errno(e) === "ENOENT") return false; // just released
      throw e;
    }
    try {
      const { ino } = fstatSync(fd);
      if (holderAlive(readFileSync(fd, "utf8"))) return false;
      const claim = `${lock}.takeover-${ino}`;
      try {
        linkSync(lock, claim);
      } catch (e) {
        if (errno(e) === "EEXIST" || errno(e) === "ENOENT") return false; // another waiter is on it
        throw e;
      }
      try {
        if (statSync(claim).ino !== ino) return false; // the lock changed hands meanwhile
        renameSync(mine, lock); // replaces the stale file in one step: the lock is never absent
        return true;
      } finally {
        rmSync(claim, { force: true });
      }
    } finally {
      closeSync(fd);
    }
  } finally {
    rmSync(mine, { force: true });
  }
}

/** Only a positive process id that exists is a live holder: empty, not a number, 0 (a process group) or negative is stale. */
function holderAlive(text: string) {
  const pid = Number(text);
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return errno(e) !== "ESRCH"; // EPERM: it exists, under another user
  }
}

/** PURE: a JUnit report, bun's or Playwright's → every test it lists as skipped or todo, as "file > name". */
export function notRun(report: string): string[] {
  const entity: Record<string, string> = {
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    amp: "&",
  };
  const text = (s = "") =>
    s.replace(/&(quot|apos|lt|gt|amp);/g, (_, e: string) => entity[e] ?? _);
  return [
    ...report.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g),
  ]
    .filter(([, , body = ""]) => body.includes("<skipped"))
    .map(([, attrs = ""]) => {
      const attr = (k: string) =>
        text(attrs.match(new RegExp(`\\b${k}="([^"]*)"`))?.[1]);
      return `${attr("file") || attr("classname")} > ${attr("name")}`;
    });
}

/**
 * `bun run gate tests [e2e]`: bun's tests, or the browser checks, as CI runs them (CI=1, so bun and Playwright
 * refuse .only), then fails if any test was skipped or left todo, however it was switched off, unless MAY_SKIP
 * lists it.
 */
function allTestsRun(repo: string, e2e: boolean): number {
  const dir = mkdtempSync(join(tmpdir(), "done-gate-tests-"));
  const report = join(dir, "junit.xml");
  try {
    const r = spawnSync(
      process.execPath,
      e2e
        ? ["run", "e2e", "--reporter=list,junit"]
        : ["test", "--reporter=junit", `--reporter-outfile=${report}`],
      {
        cwd: repo,
        stdio: "inherit",
        env: { ...process.env, CI: "1", PLAYWRIGHT_JUNIT_OUTPUT_FILE: report },
      },
    );
    const off = notRun(
      existsSync(report) ? readFileSync(report, "utf8") : "",
    ).filter((t) => !(t in MAY_SKIP));
    if (off.length)
      console.error(
        `✗ ${off.length} test(s) did not run (skipped or todo):\n${off.map((t) => `- ${t}`).join("\n")}\nMake each one run. One that truly can't run everywhere goes in MAY_SKIP in scripts/done-gate.ts, with why; Devesh sees that change.`,
      );
    return (r.status ?? 1) || (off.length ? 1 : 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Browser runs start fresh servers (CI=1) and put the worker on a free port. */
const browserEnv = async () => ({ PORT: String(await freePort()), CI: "1" });

const tail = (out: string, lines = 60) =>
  out.trimEnd().split("\n").slice(-lines).join("\n");
const tally = (name: string, out: string) => {
  const n = out.match(/(\d+) pass(ed)?\b/)?.[1];
  return n ? `${n} ${name}` : name;
};

async function runChecks(repo: string): Promise<{ ok: boolean; text: string }> {
  const dbUp = await reachable(54322);
  if (!dbUp && spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0)
    return {
      ok: false,
      text: "the local database is not running, so the tests can't run. Start it with `supabase start`, then stop again.",
    };
  const passed: string[] = [];
  /** The first failure, or nothing when every check passes. */
  const runEach = async (checks: Check[]) => {
    for (const c of checks) {
      const r = run(repo, c.cmd, c.browser ? await browserEnv() : {});
      if (r.status !== 0)
        return `${c.name} failed (\`${c.cmd.join(" ")}\`):\n${tail(r.out)}`;
      passed.push(tally(c.name, r.out));
    }
  };
  const onDb = CHECKS.filter((c) => c.db);
  const failed =
    (await runEach(CHECKS.filter((c) => !c.db))) ??
    (dbUp
      ? await onSharedStack(repo, () => runEach(onDb)).catch(
          (e: Error) =>
            `${onDb.map((c) => c.name).join(", ")} did not run: ${e.message}`,
        )
      : undefined);
  if (failed) return { ok: false, text: failed };
  if (!dbUp)
    passed.push(
      "NOT run here (no Docker): tests, database policies, browser checks; CI runs them",
    );
  return { ok: true, text: passed.join(", ") };
}

const rulesOn = (snap: Snap) =>
  checkRules(
    snap.files,
    snap.added,
    (name, file) => snap.users.get(`${file} ${name}`) ?? [],
  );
const listed = (problems: string[]) =>
  `${problems.map((p) => `- ${p}`).join("\n")}\nFix each one. For a deliberate exception, add \`${ALLOW} <why>\` to that line; Devesh sees every exception.`;

/** Rules + checks: everything a machine can prove. Checks are cached per exact code. */
async function prove(snap: Snap, store: Store): Promise<Proof> {
  const { problems, notes } = rulesOn(snap);
  if (problems.length)
    return {
      ok: false,
      headline: `${problems.length} rule problem(s), first: ${problems[0]}`,
      reason: `You can't finish yet: your change breaks the done rules.\n${listed(problems)}`,
    };
  const cached = store.get("checked", snap.tree);
  if (cached) return { ok: true, checks: cached, notes };
  const r = await runChecks(snap.repo);
  if (!r.ok)
    return {
      ok: false,
      headline: r.text.split("\n")[0] ?? "a check failed",
      reason: `You can't finish yet: ${r.text}\nFix the cause. Never skip, silence or weaken a check to get past it.`,
    };
  store.put("checked", snap.tree, r.text);
  return { ok: true, checks: r.text, notes };
}

/** `codex`: the agent is Codex, which has no verifier agent, so it is never sent back to run one. */
async function judge(
  snap: Snap,
  store: Store,
  codex: boolean,
): Promise<
  | { ok: true; message: string }
  | { ok: false; headline: string; reason: string }
> {
  const proof = await prove(snap, store);
  if (!proof.ok) return proof;
  const told = proof.notes.length ? ` · ⚠ ${proof.notes.join(" · ")}` : "";
  if (!snap.files.some((f) => PRODUCT.test(f) && !TEST.test(f)))
    return {
      ok: true,
      message: `Done gate ✓ ${proof.checks} (no product code changed, so no verifier needed)${told}`,
    };
  const ruling = parseRuling(store.get("verdict", snap.tree));
  if (!ruling && codex)
    return {
      ok: true,
      message: `Done gate ⚠ checks green (${proof.checks}), NOT independently verified (Codex has no verifier agent): ask Claude to run the verifier, or check it yourself${told}`,
    };
  if (!ruling)
    return {
      ok: false,
      headline: "product code changed and nobody independent has seen it work",
      reason: NEED_VERIFIER,
    };
  if (ruling.verdict === "cannot-verify")
    return {
      ok: true,
      message: `Done gate ⚠ NOT verified: the verifier needs something only you can provide: ${ruling.note} (checks green: ${proof.checks})${told}`,
    };
  if (ruling.verdict === "fail")
    return {
      ok: false,
      headline: `the verifier ruled FAIL: ${ruling.note}`,
      reason: `You can't finish yet: the verifier ruled FAIL: ${ruling.note}\nFix what it found, then run the verifier again. It must rule on the code exactly as you leave it.`,
    };
  return {
    ok: true,
    message: `Done gate ✓ ${proof.checks} · verifier PASS: ${ruling.note}${told}`,
  };
}

function parseRuling(raw: string | undefined): Ruling | undefined {
  try {
    const r = JSON.parse(raw ?? "") as Ruling;
    return ["pass", "fail", "cannot-verify"].includes(r.verdict) && r.note
      ? r
      : undefined;
  } catch {
    return undefined;
  }
}

const say = (systemMessage: string) =>
  process.stdout.write(JSON.stringify({ systemMessage }));

async function stop(
  input: HookInput,
  repo: string,
  store: Store,
  session: string,
  codex: boolean,
) {
  if (input.background_tasks?.length || input.session_crons?.length) return; // it will be woken again
  const snap = snapshot(repo);
  if (store.get("accepted", session) === snap.tree) return; // nothing changed since the last accepted stop
  if (store.get("gave-up", session) === snap.tree)
    return say(
      "Done gate ✗ still NOT DONE (unchanged since the agent gave up)",
    );
  const pause = store.take("pause", snap.tree);
  if (pause)
    return say(
      `Done gate ⏸ waiting on you: ${pause} (the change so far is NOT verified)`,
    );
  const j = await judge(snap, store, codex);
  if (j.ok) {
    store.take("blocks", session);
    store.put("accepted", session, snap.tree);
    return say(j.message);
  }
  const n = Number(store.get("blocks", session) ?? 0) + 1;
  if (n > MAX_BLOCKS) {
    store.take("blocks", session);
    store.put("gave-up", session, snap.tree);
    return say(
      `Done gate ✗ NOT DONE: the agent stopped after ${MAX_BLOCKS} tries, still failing: ${j.headline}`,
    );
  }
  store.put("blocks", session, String(n));
  const told = `Done gate ✗ sent the agent back (${n}/${MAX_BLOCKS}): ${j.headline}`;
  // Claude Code and Codex both document this for Stop; Codex ignores stdout on exit 2, losing Devesh's line.
  if (input.hook_event_name === "Stop")
    return process.stdout.write(
      JSON.stringify({
        decision: "block",
        reason: j.reason,
        systemMessage: told,
      }),
    );
  say(told); // TeammateIdle blocks only by exit 2
  process.stderr.write(j.reason);
  process.exit(2);
}

/** The verifier may finish only after recording a ruling on the code as it is now; then that ruling counts. */
function verifierDone(store: Store, tree: string) {
  const ruling = store.take("pending", tree);
  if (ruling) return store.put("verdict", tree, ruling);
  process.stderr.write(
    'Before you finish, record your ruling on the code exactly as it is now:\nbun run gate verdict pass|fail "<one line: what you saw>"\nor, only when seeing it work needs something only Devesh has: bun run gate verdict cannot-verify "<exactly what he must provide>"',
  );
  process.exit(2);
}

/** `codex`: run by .codex/hooks.json (`hook codex`) rather than Claude Code's .claude/settings.json. */
async function hook(input: HookInput, codex: boolean) {
  const repo = git(
    input.cwd ?? process.cwd(),
    ["rev-parse", "--show-toplevel"],
    {},
    true,
  );
  const own = repo && join(repo, "scripts", "done-gate.ts");
  if (!own || !existsSync(own)) return; // a checkout without this gate
  if (realpathSync(own) !== realpathSync(import.meta.path)) {
    // Hooks load this file from the project root; always judge with the gate that belongs to the code.
    const r = spawnSync(
      process.execPath,
      [own, "hook", ...(codex ? ["codex"] : [])],
      {
        input: JSON.stringify(input),
        stdio: ["pipe", "inherit", "inherit"],
      },
    );
    process.exit(r.status ?? 0);
  }
  const store = new Store(stateDir(repo));
  const session = `${input.session_id ?? "unknown"}-${Bun.hash(repo).toString(36)}`;
  const tree = () => snapshot(repo, false).tree;
  switch (input.hook_event_name) {
    case "SessionStart":
      if (!store.get("accepted", session))
        store.put("accepted", session, tree());
      return;
    case "SubagentStart": // a fresh verifier: forget any ruling recorded before it started
      if (input.agent_type === "verifier") store.take("pending", tree());
      return;
    case "SubagentStop":
      if (input.agent_type === "verifier") return verifierDone(store, tree());
      return;
    case "Stop":
    case "TeammateIdle":
      return stop(input, repo, store, session, codex);
  }
}

const USAGE = `usage: bun run gate [rules [--base <ref>] | tests [e2e] | pause "<question>" | verdict pass|fail "<what you saw>" | verdict cannot-verify "<what only Devesh can provide>"]
       bun run see <console path> [more paths]   (":org" in a path becomes the seeded workspace)`;

if (import.meta.main) {
  const [cmd = "check", ...args] = process.argv.slice(2);
  if (cmd === "hook") {
    try {
      await hook(
        JSON.parse((await Bun.stdin.text()) || "{}") as HookInput,
        args[0] === "codex",
      );
    } catch (e) {
      say(
        `Done gate ⚠ could not run (${String(e).split("\n")[0]}); this stop was NOT checked`,
      );
    }
    process.exit(0);
  }
  const repo = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const store = new Store(stateDir(repo));
  const text = args.join(" ").trim();
  if (cmd === "check") {
    const snap = snapshot(repo);
    const proof = await prove(snap, store);
    const ruling = parseRuling(store.get("verdict", snap.tree));
    console.log(
      proof.ok
        ? `Done gate ✓ ${proof.checks}${proof.notes.map((n) => `\n⚠ ${n}`).join("")}`
        : `Done gate ✗ ${proof.reason}`,
    );
    console.log(
      ruling
        ? `Verifier on this exact code: ${ruling.verdict.toUpperCase()}: ${ruling.note}`
        : "Verifier: no ruling on this exact code yet.",
    );
    process.exit(proof.ok ? 0 : 1);
  } else if (
    cmd === "rules" &&
    (!args.length || (args[0] === "--base" && args[1] && args.length === 2))
  ) {
    const base = args[1] ?? "origin/main";
    let snap: Snap;
    try {
      snap = snapshot(repo, true, base);
    } catch (e) {
      console.error(
        `Done rules ✗ could not compare the change with ${base}: ${String(e).split("\n")[0]}`,
      );
      process.exit(2);
    }
    const { problems, notes } = rulesOn(snap);
    console.log(
      (problems.length
        ? `Done rules ✗ ${problems.length} problem(s) in the change since ${base}:\n${listed(problems)}`
        : `Done rules ✓ nothing in the change since ${base} breaks them`) +
        notes.map((n) => `\n⚠ ${n}`).join(""),
    );
    process.exit(problems.length ? 1 : 0);
  } else if (
    cmd === "tests" &&
    (!args.length || (args[0] === "e2e" && args.length === 1))
  ) {
    process.exit(allTestsRun(repo, args[0] === "e2e"));
  } else if (cmd === "pause" && text) {
    store.put("pause", snapshot(repo, false).tree, text);
    console.log(
      "Paused. Your next stop reaches Devesh as a question, with the change marked NOT verified.",
    );
  } else if (
    cmd === "verdict" &&
    ["pass", "fail", "cannot-verify"].includes(args[0] ?? "") &&
    args.slice(1).join(" ").trim()
  ) {
    const ruling: Ruling = {
      verdict: args[0] as Ruling["verdict"],
      note: args.slice(1).join(" ").trim(),
    };
    store.put("pending", snapshot(repo, false).tree, JSON.stringify(ruling));
    console.log(
      `Ruling noted: ${ruling.verdict.toUpperCase()}: ${ruling.note}\nIt counts only when it comes from the verifier agent, and only for the code exactly as it is now.`,
    );
  } else if (cmd === "see" && text) {
    const out = mkdtempSync(join(tmpdir(), "revenue-os-see-"));
    const r = await onSharedStack(repo, async () =>
      run(repo, ["bun", "run", "local", "bun", "run", "e2e", "see.e2e.ts"], {
        ...(await browserEnv()),
        SEE_PATHS: text,
        SEE_OUT: out,
      }),
    ).catch((e: Error) => ({ status: 1, out: e.message }));
    console.log(tail(r.out, 30));
    console.log(
      r.status === 0
        ? `\nSaved in ${out}: per path, a .png (the page) and a .txt (URL, visible text, every error).`
        : "\nsee failed; the output above says why.",
    );
    process.exit(r.status);
  } else {
    console.error(USAGE);
    process.exit(2);
  }
}
