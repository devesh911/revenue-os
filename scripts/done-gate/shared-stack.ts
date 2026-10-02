// Every worktree shares one local stack (one database, the console preview on port 4173): a lock makes whatever
// uses it take turns.

import {
  closeSync,
  fstatSync,
  linkSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { stateDir } from "./store";

const LOCK_POLL_MS = 200;
const LOCK_WAIT_MS = 30 * 60_000; // then the check fails, naming the holder (the Stop hooks allow an hour)

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
