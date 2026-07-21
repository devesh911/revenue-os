// Agents — styled shell with an honest empty state. Agents and workflows are
// versioned server-side (mutating an active version is a bug), and the console's
// /agents endpoint isn't live yet — it lands with the backend wave. Until then this
// page explains itself instead of faking data: no fabricated list, no placeholders.
import { AgentsIcon } from "../../ui/icons";
import { PageHeader } from "../../ui/layout";
import { Card } from "../../ui/primitives";

export function AgentsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Agents"
        description="Voice & messaging agents and their workflows"
      />
      <Card padding="lg">
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-pill bg-nav-active text-muted">
            <AgentsIcon size={20} />
          </span>
          <p className="text-sm font-semibold text-ink">
            Agent management isn't in the console yet
          </p>
          <p className="max-w-md text-sm text-muted">
            Agents and workflows are versioned server-side, but the console's
            /agents endpoint isn't live — it arrives with the backend wave. Once
            it lands, this page will list each agent and its workflow versions.
          </p>
        </div>
      </Card>
    </div>
  );
}
