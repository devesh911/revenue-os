// Who is signed in, for the whole tree (S7.2: the Supabase SDK owns the tokens — this only mirrors
// the session). Fed by onAuthStateChange, which emits INITIAL_SESSION on subscribe, so there is no
// separate getSession call; the client is resolved inside the effect, never at module scope (boot
// honesty). reduceAuth decides when the query cache is wiped. signOut signs out THIS device only
// and marks the sign-out deliberate, so the session gate sends it to plain /login — a session lost
// any other way (a 401, expiry, another tab) returns with `next`.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getSupabase } from "../../lib/supabase";
import { type AuthState, reduceAuth } from "./auth-state";

type Session = {
  state: AuthState;
  signedOutByUser: boolean;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession needs a <SessionProvider>");
  return session;
}

export function SessionProvider({
  client,
  queryClient,
  initialState = { status: "loading" },
  children,
}: {
  client?: Pick<SupabaseClient, "auth">; // default: the app's lazy getSupabase()
  queryClient: QueryClient;
  initialState?: AuthState; // tests pin the state instead of waiting on an auth event
  children: ReactNode;
}) {
  const [state, setState] = useState(initialState);
  const [signedOutByUser, setSignedOutByUser] = useState(false);
  const current = useRef(state);

  useEffect(() => {
    const { auth } = client ?? getSupabase();
    const { data } = auth.onAuthStateChange((event, session) => {
      const { next, clearCache } = reduceAuth(current.current, event, session);
      if (clearCache) queryClient.clear();
      if (next.status === "signedIn") setSignedOutByUser(false);
      current.current = next;
      setState(next);
    });
    return () => data.subscription.unsubscribe();
  }, [client, queryClient]);

  const value = useMemo<Session>(
    () => ({
      state,
      signedOutByUser,
      signOut: async () => {
        setSignedOutByUser(true);
        await (client ?? getSupabase()).auth.signOut({ scope: "local" });
      },
    }),
    [state, signedOutByUser, client],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
