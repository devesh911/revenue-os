// The change as git reports it: the files a diff touches and every line it adds, numbered.

export type Added = { file: string; line: number; text: string };

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
