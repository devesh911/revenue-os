// Whether a file uses an export: by name, through barrel files that `export *`, through a namespace, or after
// an import() or require(); and under which names a file passes an export on (`export { x } from`), which is no use
// by itself: only a use of the name it passes on counts (snapshot.ts follows it).

import { dirname, join } from "node:path";
import { uncommented } from "./code-text";

const reEscape = (s: string) => s.replace(/\$/g, "\\$");
export const modulePath = (p: string) =>
  p.replace(/\.[cm]?[jt]sx?$/, "").replace(/\/index$/, "");
export const STAR_FROM =
  /\bexport\s*\*\s*(?:as\s+[\w$]+\s*)?from\s*["']([^"']+)["']/g;

/** PURE: can `spec`, imported by `from`, be `file`? A path must lead to it or its folder; a package name or alias only into its packages/<name>. */
export function leadsTo(spec: string, from: string, file: string) {
  if (!spec.startsWith(".")) {
    const pkg = file.match(/^packages\/([^/]+)\//)?.[1];
    return !!pkg && new RegExp(`(^|[/@])${pkg}(/|$)`).test(spec);
  }
  const target = modulePath(join(dirname(from), spec));
  return target === modulePath(file) || target === dirname(file);
}

/** PURE: the module paths `spec`, imported by `from`, may name, most likely first; none for a package name or alias. */
export const candidatesOf = (spec: string, from: string) => {
  if (!spec.startsWith(".")) return [];
  const base = join(dirname(from), spec).replace(/\.[cm]?js$/, "");
  const ends = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
  return [
    base,
    ...ends.map((e) => base + e),
    ...ends.map((e) => `${base}/index${e}`),
  ];
};

/**
 * PURE: the names under which `source`, the text of `from`, passes on `name`, which `file` exports, with
 * `export { name } from` or `export { name as other } from` a module that can be `file` or one of its `barrels`.
 */
export function reExportsOf(
  source: string,
  from: string,
  file: string,
  name: string,
  barrels: string[] = [],
): string[] {
  return [
    ...uncommented(source).matchAll(
      /\bexport\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g,
    ),
  ].flatMap(([, list = "", spec = ""]) =>
    [file, ...barrels].some((t) => leadsTo(spec, from, t))
      ? list.split(",").flatMap((s) => {
          const [passed = "", as = passed] = s.trim().split(/\s+as\s+/);
          return passed === name && /^[\w$]+$/.test(as) ? [as] : [];
        })
      : [],
  );
}

/**
 * PURE: does `source`, the text of `from`, use `name`, which `file` exports? Another file must import it by name
 * (any import block, beside a default import, renamed or not) from a module that can be `file` or one of its
 * `barrels` (modules that `export *` from it), read it as ns.name, destructure it or hand ns on whole after
 * `import * as ns` of it, or name it after an import() or require() of it; passing it on (`export { name } from`)
 * is no use (reExportsOf). `file` itself must use it beyond its declaration (a ternary branch and a `case` count),
 * not as a property, an object key or a parameter. A word that merely matches is no use.
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
  const code = uncommented(source);
  const into = (spec: string) =>
    [file, ...barrels].some((t) => leadsTo(spec, from, t));
  if (name === "default")
    // a default import, `default as`, or an import() or require() of the module
    return (
      from !== file &&
      [
        ...code.matchAll(
          /\b(?:import\s+(?:type\s+)?(?:[\w$]+\s*(?:,\s*\{[^}]*\})?|\{[^}]*\bdefault\b[^}]*\})\s*from|(?:import|require)\s*\()\s*["']([^"']+)["']/g,
        ),
      ].some(([, spec = ""]) => into(spec))
    );
  if (from === file)
    // without its declaration, the imports, and any `export { … }` list naming it
    return new RegExp(`(?<=(?:\\?|\\bcase)\\s*)${id}|${id}(?!\\s*\\??:)`).test(
      bare.replace(
        new RegExp(
          `^import\\b[^;]*;|^export\\s*\\{[^}]*\\}\\s*;?|(?:^export\\s+)?(?:async\\s+)?(?:function\\*?|const|let|var|class)\\s+${id}`,
          "gm",
        ),
        "",
      ),
    );
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
    /\bimport\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g,
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
