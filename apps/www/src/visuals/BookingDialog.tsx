import {
  type ComponentProps,
  type FormEvent,
  Fragment,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { bookingCopy as copy } from "../content/booking";
import { closing } from "../content/closing";
import { CtaButton } from "../design/CtaButton";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { MonoLabel } from "../design/MonoLabel";
import { hasHeardSample, track } from "../lib/analytics";
import {
  BookingError,
  booking,
  type DaySlots,
  isEmail,
  normalisePhone,
} from "../lib/booking";
import { useBooking } from "../lib/bookingContext";
import { cx } from "../lib/cx";
import { CHECK, CLOSE, Icon, INFO } from "./Icon";

// The one demo-booking flow every primary demo button opens (lib/bookingContext).
// A native modal <dialog>: showModal() brings the focus trap, Escape and the top
// layer, and the browser hands focus back to the opener on close. Three steps —
// choose a time, your details, confirmation — start fresh on every opening, and
// each step's heading takes focus as it appears. Times come from lib/booking
// (Cal.com, or the preview adapter, which the dialog always discloses — to screen
// readers too, as the dialog's description) and read in the visitor's own zone.
// From 640px up it is a 560px paper card with the page's soft lift, anchored near
// the top, so the header stays put while steps change height; below, a full-height
// sheet. The look is the page's own: serif headings, mono for dates and times, ink
// pills, paper-2 wells, stone for secondary text, clay-deep for errors. SSR renders
// it closed, and window/document are only touched inside effects and handlers.
const TITLE_ID = "booking-title";
const NOTICE_ID = "booking-preview";
const FALLBACK_ZONE = "Asia/Kolkata";
const INDIA_ZONES = ["Asia/Kolkata", "Asia/Calcutta"];
const MAX_DAYS = 10;

type Step = "time" | "details" | "done";
type Slots =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; days: DaySlots[] };
type Field = "name" | "email" | "company" | "phone";
type Values = Record<Field, string>;
// What the checks need besides the value: whether a local number reads as Indian
// (the visitor is in India's zone), and a number Cal.com has already refused.
type Checks = { india: boolean; refusedPhone: string };

const filled = (v: string) => v.trim() !== "";

// The form, in order: each field's check and its autofill / keyboard hints. Enter
// moves to the next field ("next"); only the last field submits ("done").
const FIELDS: Array<{
  id: Field;
  valid: (v: string, c: Checks) => boolean;
  input: ComponentProps<"input">;
}> = [
  {
    id: "name",
    valid: filled,
    input: {
      autoComplete: "name",
      autoCapitalize: "words",
      enterKeyHint: "next",
    },
  },
  {
    id: "email",
    valid: isEmail,
    input: {
      type: "email",
      autoComplete: "email",
      inputMode: "email",
      spellCheck: false,
      enterKeyHint: "next",
    },
  },
  {
    id: "company",
    valid: filled,
    input: {
      autoComplete: "organization",
      autoCapitalize: "words",
      enterKeyHint: "next",
    },
  },
  {
    id: "phone",
    valid: (v, c) => {
      const e164 = normalisePhone(v, c.india);
      return !filled(v) || (e164 !== null && e164 !== c.refusedPhone);
    },
    input: { type: "tel", autoComplete: "tel", enterKeyHint: "done" },
  },
];
const invalid = (v: Values, c: Checks): Field[] =>
  FIELDS.filter((f) => !f.valid(v[f.id], c)).map((f) => f.id);

const kindOf = (err: unknown) =>
  err instanceof BookingError ? err.kind : "rejected";

const isSubmit = (el: EventTarget | null) =>
  el instanceof Element && el.closest("[type=submit]") !== null;

// Step headings take focus as they mount (a stable callback ref runs once).
const focusOnMount = (el: HTMLElement | null) => {
  el?.focus();
};
// Keeps the chosen day visible in the phone's sideways-scrolling row.
const keepInView = (el: HTMLElement | null) => {
  el?.scrollIntoView({ block: "nearest", inline: "nearest" });
};

// ── dates and times in the visitor's zone: "Thu", "25 Sep", "11:30 AM" ───────
function visitorZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_ZONE;
  } catch {
    return FALLBACK_ZONE;
  }
}

// en-US names ("Sep", not en-GB's "Sept"), assembled day-first as India writes it.
function dateParts(iso: string, timeZone: string, style: "short" | "long") {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: style,
      day: "numeric",
      month: style,
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return { weekday: p.weekday ?? "", date: `${p.day} ${p.month}` };
}

const dayParts = (date: string) =>
  dateParts(`${date}T12:00:00Z`, "UTC", "short");

// "11:30 AM" — its narrow no-break space becomes a plain no-break space, which
// the mono face carries (no fallback glyph) and which never wraps.
const timeOf = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  })
    .format(new Date(iso))
    .replace(/\s/g, " ");

const zoneName = (timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "long" })
    .formatToParts()
    .find((p) => p.type === "timeZoneName")?.value ?? timeZone;

// True for a pointer that lands on the backdrop: it targets the dialog itself
// (never a key-activated control inside it) but falls outside the panel's box.
function onBackdrop(e: MouseEvent<HTMLDialogElement>): boolean {
  const r = e.currentTarget.getBoundingClientRect();
  return (
    e.target === e.currentTarget &&
    (e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom)
  );
}

export function BookingDialog() {
  const { isOpen, source, close } = useBooking();
  const ref = useRef<HTMLDialogElement>(null);
  const openings = useRef(0);
  const pressedBackdrop = useRef(false);
  // A fresh key for each opening (0 while closed), so every visit starts at step 1.
  // It is set after showModal(), so the first step mounts into an open dialog.
  const [session, setSession] = useState(0);
  // True once the body scrolls under the sticky header, which then shows its edge.
  const [scrolled, setScrolled] = useState(false);
  // True while a booking request is out. The dialog can't close then: the visitor
  // would never learn whether it went through, and might book twice.
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
    document.documentElement.style.overflow = isOpen ? "hidden" : "";
    setSession(isOpen ? ++openings.current : 0);
    setScrolled(false);
  }, [isOpen]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a backdrop click is the pointer twin of Escape, which the native dialog already handles
    <dialog
      ref={ref}
      aria-labelledby={TITLE_ID}
      aria-describedby={booking.live ? undefined : NOTICE_ID}
      // cancel (Escape) fires at once; close follows as a task, too late for a
      // reopen in between, which would find isOpen still true and do nothing.
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
      // Chrome lets a repeated Escape close the dialog even when cancel is
      // refused; while booking, it opens straight back on the same step.
      onClose={(e) => {
        if (!busy) close();
        else if (!e.currentTarget.open) e.currentTarget.showModal();
      }}
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
      onPointerDown={(e) => {
        pressedBackdrop.current = onBackdrop(e);
      }}
      onClick={(e) => {
        if (!busy && pressedBackdrop.current && onBackdrop(e)) close();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none scroll-pt-[132px] overflow-y-auto overscroll-contain border-0 bg-paper p-0 text-ink transition-[opacity,translate] duration-200 ease-[var(--ease-soft)] backdrop:bg-ink/20 backdrop:transition-opacity backdrop:duration-200 forced-colors:border starting:translate-y-[8px] starting:opacity-0 starting:backdrop:opacity-0 sm:mx-auto sm:mt-[min(9dvh,88px)] sm:h-fit sm:max-h-[calc(100dvh_-_min(9dvh,88px)_-_24px)] sm:w-[560px] sm:max-w-[calc(100vw_-_48px)] sm:scroll-pt-[148px] sm:rounded-[24px] sm:border sm:border-line sm:shadow-lift"
    >
      <div
        className={cx(
          "sticky top-0 z-10 flex items-start justify-between gap-[16px] border-b bg-paper px-[20px] pt-[20px] pb-[16px] transition-[border-color] duration-200 sm:px-[32px] sm:pt-[28px] sm:pb-[20px]",
          scrolled ? "border-line" : "border-transparent",
        )}
      >
        <div>
          <Kicker>{copy.length}</Kicker>
          <Heading id={TITLE_ID} size="card" className="mt-[12px]">
            {copy.title}
          </Heading>
        </div>
        <button
          type="button"
          aria-label={copy.close}
          aria-disabled={busy || undefined}
          onClick={() => {
            if (!busy) close();
          }}
          className={cx(
            "-mt-[12px] -mr-[12px] grid size-[44px] shrink-0 place-items-center rounded-full text-stone transition-[background-color,color] duration-200",
            busy
              ? "cursor-not-allowed opacity-40"
              : "cursor-pointer hover:bg-ink/[0.05] hover:text-ink",
          )}
        >
          <Icon d={CLOSE} className="size-[18px]" />
        </button>
      </div>
      <div className="px-[20px] pb-[max(28px,env(safe-area-inset-bottom))] sm:px-[32px] sm:pb-[32px]">
        {!booking.live && (
          <p
            id={NOTICE_ID}
            className="mb-[24px] flex items-start gap-[10px] rounded-[16px] bg-paper-2 px-[16px] py-[12px] text-[14px] text-ink-2 leading-[1.5]"
          >
            <Icon
              d={INFO}
              className="mt-[2px] size-[16px] shrink-0 text-stone"
            />
            {copy.preview}
          </p>
        )}
        {session > 0 && (
          <Flow
            key={session}
            source={source}
            pending={busy}
            onPending={setBusy}
            onClose={close}
          />
        )}
      </div>
    </dialog>
  );
}

// One dialog session: the slots, the chosen time, the form and the outcome. The
// in-flight flag lives with the dialog, which refuses to close while it is set.
function Flow({
  source,
  pending,
  onPending,
  onClose,
}: {
  source: string;
  pending: boolean;
  onPending: (pending: boolean) => void;
  onClose: () => void;
}) {
  const [zone] = useState(visitorZone);
  const [step, setStep] = useState<Step>("time");
  const [slots, setSlots] = useState<Slots>({ state: "loading" });
  const [attempt, setAttempt] = useState(0); // bumped by "Try again"
  const [day, setDay] = useState("");
  const [start, setStart] = useState("");
  const [taken, setTaken] = useState(false);
  const [values, setValues] = useState<Values>({
    name: "",
    email: "",
    company: "",
    phone: "",
  });
  const [errors, setErrors] = useState<Field[] | null>(null); // null until a first submit
  const [refusedPhone, setRefusedPhone] = useState("");
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  const request = useRef(0);
  const india = INDIA_ZONES.includes(zone);
  const checks = { india, refusedPhone };

  const load = useCallback(() => {
    const id = ++request.current; // only the latest request may land
    setSlots({ state: "loading" });
    booking.fetchSlots(zone).then(
      (all) => {
        if (id !== request.current) return;
        const days = all.slice(0, MAX_DAYS);
        setSlots({ state: "ready", days });
        setDay((d) =>
          days.some((x) => x.date === d) ? d : (days[0]?.date ?? ""),
        );
      },
      (err: unknown) => {
        if (id !== request.current) return;
        track("Booking error", { stage: "slots", kind: kindOf(err) });
        setSlots({ state: "error" });
      },
    );
  }, [zone]);
  useEffect(load, [load]);

  // After a first submit, a fixed field's error clears as you type and a field
  // left invalid shows it again on blur. Clearing on blur instead moved the submit
  // button between mousedown and mouseup, which swallowed the click.
  const revalidate = (next: Values, blurred?: Field) =>
    setErrors(
      (errs) =>
        errs &&
        invalid(next, checks).filter((f) => errs.includes(f) || f === blurred),
    );

  // Shows these errors and moves to the first, after the render, so a screen
  // reader reads the field together with its new error.
  const flag = (bad: Field[], also?: () => void) => {
    flushSync(() => {
      also?.();
      setErrors(bad);
    });
    if (bad[0]) document.getElementById(`booking-${bad[0]}`)?.focus();
  };

  const pick = (iso: string) => {
    if (!started.current) {
      started.current = true;
      track("Booking start", { source });
    }
    setStart(iso);
    setTaken(false);
    setStep("details");
  };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return; // the button stays focusable while booking, so guard here
    const bad = invalid(values, checks);
    flag(bad);
    if (bad.length) return;
    const phone = normalisePhone(values.phone, india) ?? undefined;
    onPending(true);
    setFailed(false);
    try {
      await booking.createBooking({
        start,
        name: values.name.trim(),
        email: values.email.trim(),
        company: values.company.trim(),
        phone,
        timeZone: zone,
        source,
      });
      track("Booking complete", {
        source,
        heard_sample: hasHeardSample() ? "yes" : "no",
      });
      setStep("done");
    } catch (err) {
      const kind = kindOf(err);
      track("Booking error", { stage: "submit", kind });
      if (kind === "unavailable") {
        setTaken(true);
        setStart("");
        setStep("time");
        load();
      } else if (
        // Cal.com refused the phone number: say so at the field, not in general.
        kind === "rejected" &&
        phone &&
        err instanceof Error &&
        /phone/i.test(err.message)
      ) {
        flag(["phone"], () => setRefusedPhone(phone));
      } else setFailed(true);
    } finally {
      onPending(false);
    }
  }

  if (step === "done")
    return (
      <Confirmation
        start={start}
        zone={zone}
        email={values.email.trim()}
        onClose={onClose}
      />
    );
  if (step === "details")
    return (
      <DetailsStep
        summary={summaryOf(start, zone)}
        values={values}
        errors={errors}
        india={india}
        pending={pending}
        failed={failed}
        onChange={(field, value) => {
          const next = { ...values, [field]: value };
          setValues(next);
          revalidate(next);
        }}
        onBlur={(field) => revalidate(values, field)}
        onBack={() => setStep("time")}
        onSubmit={submit}
      />
    );
  return (
    <TimeStep
      zone={zone}
      slots={slots}
      attempt={attempt}
      day={day}
      start={start}
      taken={taken}
      onDay={setDay}
      onPick={pick}
      onRetry={() => {
        setAttempt((n) => n + 1);
        load();
      }}
    />
  );
}

const summaryOf = (iso: string, zone: string) => {
  const { weekday, date } = dateParts(iso, zone, "short");
  return `${weekday}, ${date} · ${timeOf(iso, zone)}`;
};

// A step's heading: serif, one rank below the dialog title, and the focus target.
function StepHeading({ children }: { children: ReactNode }) {
  return (
    <Heading
      as="h3"
      size="none"
      ref={focusOnMount}
      tabIndex={-1}
      className="text-[21px] text-ink leading-[1.25] tracking-[-0.01em] outline-none"
    >
      {children}
    </Heading>
  );
}

// A selectable day or time: the ghost pill's hairline on the card shade, ink when
// chosen — and, in Windows high contrast, the system's Highlight pair, since
// forced colours would otherwise draw chosen and unchosen alike. Transitions here
// name their properties: transition-colors would also fade the focus ring in.
const choice = (pressed: boolean) =>
  cx(
    "cursor-pointer border transition-[background-color,border-color,color] duration-200",
    pressed
      ? "border-ink bg-ink text-paper forced-colors:border-[Highlight] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:[forced-color-adjust:none]"
      : "border-ink/15 bg-card text-ink hover:border-ink/40",
  );

function TimeStep({
  zone,
  slots,
  attempt,
  day,
  start,
  taken,
  onDay,
  onPick,
  onRetry,
}: {
  zone: string;
  slots: Slots;
  attempt: number;
  day: string;
  start: string;
  taken: boolean;
  onDay: (date: string) => void;
  onPick: (iso: string) => void;
  onRetry: () => void;
}) {
  const days = slots.state === "ready" ? slots.days : [];
  const times = days.find((d) => d.date === day)?.starts ?? [];
  return (
    <>
      {/* A retry remounts the heading, which takes focus as the "Try again"
          button it replaces disappears — focus never falls to the page. */}
      <StepHeading key={attempt}>{copy.steps.time}</StepHeading>
      <p className="mt-[4px] text-[14px] text-stone leading-[1.45]">
        {copy.timezone.replace("{zone}", zoneName(zone))}
      </p>
      {taken && (
        <p
          role="alert"
          className="mt-[16px] rounded-[16px] bg-paper-2 px-[16px] py-[12px] font-medium text-[15px] text-clay-deep leading-[1.45]"
        >
          {copy.slotTaken}
        </p>
      )}
      {slots.state === "loading" && (
        <p
          role="status"
          className="mt-[20px] min-h-[200px] text-[15px] text-stone"
        >
          {copy.loading}
        </p>
      )}
      {slots.state === "error" && (
        <div role="alert" className="mt-[20px] min-h-[200px]">
          <p className="text-[15px] text-ink">{copy.loadError}</p>
          <CtaButton
            variant="ghost"
            size="md"
            onClick={onRetry}
            className="mt-[14px]"
          >
            {copy.retry}
          </CtaButton>
        </div>
      )}
      {slots.state === "ready" && days.length === 0 && (
        <p className="mt-[20px] min-h-[200px] text-[15px] text-stone">
          {copy.empty}
        </p>
      )}
      {days.length > 0 && (
        <>
          {/* On phones a sideways scroller; its 6px vertical padding keeps the
              focus ring from being clipped by the scroll box. */}
          <div className="-mx-[20px] mt-[14px] flex snap-x scroll-px-[20px] gap-[8px] overflow-x-auto px-[20px] py-[6px] [scrollbar-width:none] sm:mx-0 sm:mt-[20px] sm:grid sm:grid-cols-5 sm:overflow-visible sm:p-0 [&::-webkit-scrollbar]:hidden">
            {days.map((d) => {
              const pressed = d.date === day;
              const { weekday, date } = dayParts(d.date);
              return (
                <button
                  key={d.date}
                  type="button"
                  aria-pressed={pressed}
                  ref={pressed ? keepInView : undefined}
                  onClick={() => onDay(d.date)}
                  className={cx(
                    choice(pressed),
                    "flex w-[72px] shrink-0 snap-start flex-col items-center gap-[4px] rounded-[16px] py-[11px] sm:w-auto",
                  )}
                >
                  <MonoLabel
                    className={cx(
                      "text-[11px] uppercase leading-[1.3] tracking-[0.1em]",
                      pressed
                        ? "text-paper/70 forced-colors:text-[HighlightText]"
                        : "text-stone",
                    )}
                  >
                    {weekday}
                  </MonoLabel>{" "}
                  <MonoLabel className="whitespace-nowrap text-[14px] leading-[1.35]">
                    {date}
                  </MonoLabel>
                </button>
              );
            })}
          </div>
          <div className="mt-[10px] grid grid-cols-3 gap-[8px] sm:mt-[16px] sm:grid-cols-4">
            {times.map((iso) => (
              <button
                key={iso}
                type="button"
                aria-pressed={iso === start}
                onClick={() => onPick(iso)}
                className={cx(
                  choice(iso === start),
                  "h-[44px] rounded-full font-mono text-[14px] tabular-nums",
                )}
              >
                {timeOf(iso, zone)}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function DetailsStep({
  summary,
  values,
  errors,
  india,
  pending,
  failed,
  onChange,
  onBlur,
  onBack,
  onSubmit,
}: {
  summary: string;
  values: Values;
  errors: Field[] | null;
  india: boolean;
  pending: boolean;
  failed: boolean;
  onChange: (field: Field, value: string) => void;
  onBlur: (field: Field) => void;
  onBack: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  // True from a press on the submit button until the blur it causes (Safari
  // doesn't focus a clicked button, so that blur's relatedTarget can't tell).
  const aiming = useRef(false);
  return (
    <>
      <StepHeading>{copy.steps.details}</StepHeading>
      <div className="mt-[16px] flex items-center justify-between gap-[12px] rounded-[16px] bg-paper-2 py-[6px] pr-[6px] pl-[16px]">
        <p
          id="booking-slot"
          className="font-mono text-[14px] text-ink tabular-nums leading-[1.45]"
        >
          {summary}
        </p>
        {/* Locked while booking, so the confirmation shows the time that was sent. */}
        <button
          type="button"
          onClick={pending ? undefined : onBack}
          aria-disabled={pending || undefined}
          aria-describedby="booking-slot"
          className={cx(
            "h-[40px] shrink-0 rounded-full border border-ink/15 bg-paper px-[16px] font-medium text-[14px] text-ink transition-[background-color,border-color] duration-200",
            pending
              ? "cursor-not-allowed opacity-60"
              : "cursor-pointer hover:border-ink/40",
          )}
        >
          {copy.change}
        </button>
      </div>
      <form
        noValidate
        onPointerDown={(e) => {
          aiming.current = isSubmit(e.target);
        }}
        onSubmit={(e) => {
          aiming.current = false;
          onSubmit(e);
        }}
        className="mt-[24px] flex flex-col gap-[20px]"
      >
        {FIELDS.map(({ id, input }, i) => {
          const next = FIELDS[i + 1]?.id;
          const intl = id === "phone" && !india;
          const error = errors?.includes(id)
            ? copy.errors[intl ? "phoneIntl" : id]
            : undefined;
          const hint =
            id === "phone"
              ? copy.fields[intl ? "phoneHintIntl" : "phoneHint"]
              : undefined;
          const describedBy = cx(
            hint && `booking-${id}-hint`,
            error && `booking-${id}-error`,
          );
          return (
            <div key={id}>
              <label
                htmlFor={`booking-${id}`}
                className="block font-medium text-[14.5px] text-ink leading-[1.4]"
              >
                {copy.fields[id]}
              </label>
              {hint && (
                <p
                  id={`booking-${id}-hint`}
                  className="mt-[2px] text-[13.5px] text-stone leading-[1.45]"
                >
                  {hint}
                </p>
              )}
              <input
                {...input}
                id={`booking-${id}`}
                name={id}
                value={values[id]}
                readOnly={pending}
                onChange={(e) => onChange(id, e.target.value)}
                onKeyDown={(e) => {
                  // Enter moves on to the next field; only the last one submits.
                  if (e.key !== "Enter" || !next || e.nativeEvent.isComposing)
                    return;
                  e.preventDefault();
                  document.getElementById(`booking-${next}`)?.focus();
                }}
                onBlur={(e) => {
                  // Leaving for the submit button: submit checks every field, and
                  // an error line added now would move the button out from under
                  // the click.
                  const toSubmit = aiming.current || isSubmit(e.relatedTarget);
                  aiming.current = false;
                  if (!toSubmit) onBlur(id);
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy || undefined}
                className="mt-[8px] h-[48px] w-full rounded-[10px] border border-stone bg-card px-[14px] text-[16px] text-ink outline-offset-[1px] transition-[border-color] duration-200 hover:border-ink-2 aria-[invalid=true]:border-clay-deep sm:h-[44px]"
              />
              {error && (
                <p
                  id={`booking-${id}-error`}
                  className="mt-[6px] text-[14px] text-clay-deep leading-[1.45]"
                >
                  {error}
                </p>
              )}
            </div>
          );
        })}
        <div className="mt-[8px]">
          <CtaButton
            variant="accent"
            type="submit"
            busy={pending}
            className="max-sm:w-full"
          >
            {pending ? copy.submitting : copy.submit}
          </CtaButton>
          {/* The focused button's new label isn't reliably read out, so the wait
              is announced here too. */}
          <p role="status" className="sr-only">
            {pending ? copy.submitting : ""}
          </p>
          {failed && (
            <p role="alert" className="mt-[12px] text-[15px] text-clay-deep">
              {copy.submitError}
            </p>
          )}
        </div>
      </form>
    </>
  );
}

function Confirmation({
  start,
  zone,
  email,
  onClose,
}: {
  start: string;
  zone: string;
  email: string;
  onClose: () => void;
}) {
  const { weekday, date } = dateParts(start, zone, "long");
  // Preview mode booked nothing, so it must not claim a booking or an invite.
  const { title, invite } = booking.live
    ? { title: copy.confirmTitle, invite: copy.confirmInvite }
    : copy.previewConfirm;
  const [beforeEmail, afterEmail] = invite.split("{email}");
  return (
    <>
      <span className="grid size-[40px] place-items-center rounded-full bg-olive-deep/[0.12] text-olive-deep">
        <Icon d={CHECK} className="size-[20px]" />
      </span>
      <Heading
        as="h3"
        ref={focusOnMount}
        tabIndex={-1}
        className="mt-[16px] outline-none"
      >
        {title}
      </Heading>
      <p className="mt-[8px] font-mono text-[15px] text-ink tabular-nums leading-[1.5]">
        {copy.confirmWhen
          .replace("{date}", `${weekday}, ${date}`)
          .replace("{time}", timeOf(start, zone))}
      </p>
      <p className="mt-[10px] text-[15px] text-ink-2 leading-[1.6]">
        {beforeEmail}
        {/* The address (with the text after it) is one unit that moves down
            whole when it fits a line; only one longer than the line breaks,
            before an "@" or "." — never mid-word, never leaving "." alone. */}
        <span className="inline-block max-w-full break-words">
          <span className="font-medium text-ink">
            {[...email.matchAll(/[@.]?[^@.]*/g)]
              .filter((m) => m[0])
              .map((m) => (
                <Fragment key={m.index}>
                  {m.index > 0 && <wbr />}
                  {m[0]}
                </Fragment>
              ))}
          </span>
          {afterEmail}
        </span>
      </p>
      <div className="mt-[24px] border-line border-t pt-[20px]">
        <p className="text-[14px] text-stone">{copy.confirmCovers}</p>
        <ul className="mt-[12px] flex flex-col gap-[10px]">
          {closing.covers.map((item) => (
            <li
              key={item}
              className="flex items-start gap-[12px] text-[15px] text-ink-2 leading-[1.5]"
            >
              <Icon
                d={CHECK}
                className="mt-[3px] size-[16px] shrink-0 text-olive-deep"
              />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <CtaButton
        variant="ghost"
        onClick={onClose}
        className="mt-[28px] max-sm:w-full"
      >
        {copy.close}
      </CtaButton>
    </>
  );
}
