// Connected user chip for the sidebar footer. Lives in app/ (not ui/) because it talks
// to supabase for the signed-in email — ui/ stays pure vocabulary. Renders through the
// lazy getSupabase() getter only inside the effect (import-safe at module scope).
import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";
import { Avatar } from "../ui/primitives";

export function UserChip() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (alive) setEmail(data.session?.user.email ?? null);
      });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      <Avatar name={email ?? "?"} size="sm" />
      <span className="min-w-0 truncate text-[13px] text-ink-soft">
        {email ?? "Signed in"}
      </span>
    </div>
  );
}
