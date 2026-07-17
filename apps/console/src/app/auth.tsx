// Auth guard (S7.5): no session → login form; session → children. Supabase SDK owns tokens.
import type { Session } from "@supabase/supabase-js";
import { type ReactNode, useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";

export function AuthGuard({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      });
    const { data: sub } = getSupabase().auth.onAuthStateChange((_event, s) =>
      setSession(s),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>;
  if (!session) return <LoginScreen />;
  return <>{children}</>;
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await getSupabase().auth.signInWithPassword({
      email,
      password,
    });
    if (error) setError("Sign-in failed."); // S5.8 spirit: no provider internals
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <form
        onSubmit={submit}
        className="w-80 space-y-4 rounded-xl bg-white p-8 shadow"
      >
        <h1 className="text-lg font-semibold">Revenue OS Console</h1>
        <input
          className="w-full rounded border px-3 py-2 text-sm"
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full rounded border px-3 py-2 text-sm"
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="w-full rounded bg-black py-2 text-sm text-white"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
