// Connected user chip for the sidebar footer. Lives in app/ (not ui/) because it reads the
// signed-in email from the session context — ui/ stays pure vocabulary.
import { Avatar } from "../ui/primitives";
import { useSession } from "./session/SessionProvider";

export function UserChip() {
  const { state } = useSession();
  const email = state.status === "signedIn" ? state.email : null;
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      <Avatar name={email ?? "?"} size="sm" />
      <span className="min-w-0 truncate text-[13px] text-ink-soft">
        {email ?? "Signed in"}
      </span>
    </div>
  );
}
