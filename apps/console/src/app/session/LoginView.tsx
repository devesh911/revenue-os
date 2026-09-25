// The sign-in form (AC-C4), pure: all state comes in as props. Real <label>s tied to the inputs
// (screen readers + click-to-focus), the attributes password managers key on, a submit that is
// disabled and says so while a request is in flight (no double submits), and errors announced
// through role="alert". Invite-only accounts: no sign-up link.
import { type FormEvent, useId } from "react";
import { Button, Card, Input } from "../../ui/primitives";

const LABEL = "block pb-1.5 text-label text-muted uppercase";

export function LoginView({
  email,
  password,
  pending,
  error,
  onEmail,
  onPassword,
  onSubmit,
}: {
  email: string;
  password: string;
  pending: boolean;
  error: string | null;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <Card padding="lg" className="w-88">
        <div className="flex items-center gap-2 pb-1">
          <span aria-hidden="true" className="h-2 w-2 rounded-pill bg-accent" />
          <h1 className="text-h2">Sign in to Revenue OS</h1>
        </div>
        <p className="pb-5 text-sm text-muted">
          Use the account your workspace admin invited.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor={`${id}-email`} className={LABEL}>
              Email
            </label>
            <Input
              id={`${id}-email`}
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => onEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${id}-password`} className={LABEL}>
              Password
            </label>
            <Input
              id={`${id}-password`}
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => onPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
