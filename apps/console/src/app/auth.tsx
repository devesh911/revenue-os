// Auth guard (S7.5): no session → login form; session → children. Supabase SDK owns tokens.
import type { Session } from "@supabase/supabase-js";
import { type ReactNode, useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";
import { Button, Card, Input } from "../ui/primitives";

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

  if (loading) return <div className="p-8 text-sm text-muted">Loading…</div>;
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
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <Card padding="lg" className="w-88">
        <div className="flex items-center gap-2 pb-1">
          <span aria-hidden="true" className="h-2 w-2 rounded-pill bg-accent" />
          <h1 className="text-h2">Revenue OS Console</h1>
        </div>
        <p className="pb-5 text-sm text-muted">Sign in to your workspace.</p>
        <form onSubmit={submit} className="space-y-3">
          <Input
            type="email"
            placeholder="email"
            aria-label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            type="password"
            placeholder="password"
            aria-label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  );
}
