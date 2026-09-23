import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { bookDemo } from "../content/site";
import { Button } from "../design/Button";
import { track } from "./analytics";

// The one booking flow every primary button opens. BookingProvider holds whether
// the dialog is open and which button opened it (the analytics `source`); the
// dialog (visuals/BookingDialog) renders from it. A #book link opens it too, and
// closing clears that hash so a reload doesn't reopen it.
interface BookingState {
  isOpen: boolean;
  source: string;
  open: (source: string) => void;
  close: () => void;
}

const BookingContext = createContext<BookingState | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ isOpen: false, source: "" });
  const isOpen = useRef(false); // read by the #book handler without re-subscribing
  const open = useCallback((source: string) => {
    isOpen.current = true;
    setState({ isOpen: true, source });
  }, []);
  const close = useCallback(() => {
    isOpen.current = false;
    setState((s) => ({ ...s, isOpen: false }));
    if (location.hash === "#book")
      history.replaceState(null, "", location.pathname + location.search);
  }, []);

  useEffect(() => {
    const onHash = () => {
      if (location.hash !== "#book" || isOpen.current) return;
      track("Demo click", { source: "link" }); // deep links join the funnel too
      open("link");
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [open]);

  const value = useMemo(
    () => ({ ...state, open, close }),
    [state, open, close],
  );
  return (
    <BookingContext.Provider value={value}>{children}</BookingContext.Provider>
  );
}

export function useBooking(): BookingState {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be used inside <BookingProvider>");
  return ctx;
}

// The page's primary action. `source` names where it sits (nav, hero, pilot, …).
export function BookDemoButton({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const { open } = useBooking();
  return (
    <Button
      onClick={() => {
        track("Demo click", { source });
        open(source);
      }}
      className={className}
    >
      {bookDemo}
    </Button>
  );
}
