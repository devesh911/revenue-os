import { type CSSProperties, Fragment } from "react";

// A line of the agent's voice, streamed on like a live log: word by word in stone,
// a thin clay caret riding the newest word (it blinks a few times on the last),
// then the whole line settles to its own colour (ink). CSS only: each word carries
// its start time (--at) and caret run (--for, --n) as custom properties, so there is
// no timer, and the page's Pause switch freezes it mid-line. Remounting restarts it,
// so the caller renders it only for the line on show. `still` (a finished frame:
// reduced motion, the server render, a pause before play) is the plain line, with no
// caret. Every word wraps whole: a hyphenated one never breaks at the hyphen.
const LEAD = 120; // before the first word, so the line's new timestamp reads first
const PACE = 45; // per word
const BLINK = 1000; // one blink of the caret on the last word
const BLINKS = 2;

export function Typed({ text, still }: { text: string; still: boolean }) {
  if (still) return text;
  const words = [...text.matchAll(/[^ ]+/g)]; // a no-break space stays inside its word
  const done = LEAD + words.length * PACE + BLINK * BLINKS;
  return (
    <span
      className="animate-[ro-ink_700ms_var(--ease-soft)_var(--done)_both]"
      style={{ "--done": `${done}ms` } as CSSProperties}
    >
      {words.map((m, k) => {
        const last = k === words.length - 1;
        return (
          <Fragment key={m.index}>
            {k > 0 && " "}
            <span
              className="relative animate-[ro-type_160ms_ease-out_var(--at)_both] whitespace-nowrap after:absolute after:top-[0.14em] after:bottom-[0.06em] after:left-[calc(100%+2px)] after:w-[1.5px] after:animate-[ro-caret_var(--for)_steps(2,jump-none)_var(--at)_var(--n)] after:bg-clay after:opacity-0"
              style={
                {
                  "--at": `${LEAD + k * PACE}ms`,
                  "--for": `${last ? BLINK : 2 * PACE}ms`,
                  "--n": last ? BLINKS : 1,
                } as CSSProperties
              }
            >
              {m[0]}
            </span>
          </Fragment>
        );
      })}
    </span>
  );
}
