// The public /login route (AC-C1/C3), outside the session gate. Signed in → on to a safe `next`;
// session still unknown → neutral; signed out → the form. The SDK does the sign-in (S7.2): it
// stores the session and emits SIGNED_IN, which moves the session state on. Failures show only
// the fixed copy from signInErrorMessage, never the provider's message. The credentials are read
// from the closure, never passed as mutation variables, so no password lingers in the MutationCache.
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Redirect, useSearch } from "wouter";
import { getSupabase } from "../../lib/supabase";
import { LoginView } from "./LoginView";
import { SessionLoading } from "./RequireSession";
import { useSession } from "./SessionProvider";
import { safeNext } from "./safe-next";
import { signInErrorMessage } from "./sign-in-errors";

export function LoginPage() {
  const { state } = useSession();
  const next = new URLSearchParams(useSearch()).get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signIn = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabase().auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    },
    gcTime: 0,
  });

  if (state.status === "signedIn")
    return <Redirect replace to={safeNext(next)} />;
  if (state.status === "loading") return <SessionLoading />;
  return (
    <LoginView
      email={email}
      password={password}
      pending={signIn.isPending}
      error={signIn.error ? signInErrorMessage(signIn.error) : null}
      onEmail={setEmail}
      onPassword={setPassword}
      onSubmit={(event) => {
        event.preventDefault();
        signIn.mutate();
      }}
    />
  );
}
