// Shown when /o/:orgId is not one of the person's workspaces: says so plainly, links to
// the workspaces they do have, and offers sign-out (they may be in the wrong account). Pure.
import { Link } from "wouter";
import type { OrgListItem } from "../../features/orgs/api";
import { Button, Card } from "../../ui/primitives";

export function NoAccessView({
  orgs,
  onSignOut,
}: {
  orgs: OrgListItem[];
  onSignOut: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <Card padding="lg" className="w-full max-w-lg">
        <h1 className="text-h2 text-ink">
          You don't have access to this workspace
        </h1>
        <p className="mt-2 text-sm text-muted">
          {orgs.length > 0
            ? "Open one of your workspaces instead:"
            : "It isn't one of your workspaces."}
        </p>
        {orgs.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {orgs.map((org) => (
              <li key={org.id}>
                <Link
                  href={`/o/${org.id}/home`}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  {org.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Button variant="secondary" className="mt-6" onClick={onSignOut}>
          Sign out
        </Button>
      </Card>
    </div>
  );
}
