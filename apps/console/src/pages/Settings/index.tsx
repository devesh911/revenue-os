// Settings — org info from the existing orgs hook (R2), plus an honest shell for
// guardrail controls. The quiet-hours guardrail hook already runs server-side, but
// the console guardrail-config API hasn't shipped (backend wave), so the Guardrails
// section is a truthful placeholder — no fabricated values, no dead toggles.
import { useParams } from "wouter";
import { useOrgsQuery } from "../../features/orgs/api";
import { PageHeader, Section } from "../../ui/layout";
import { Badge, Card, DataShell } from "../../ui/primitives";

function OrganizationCard({ orgId }: { orgId: string }) {
  const { data, isLoading, isError } = useOrgsQuery();
  // data?. per the DataShell narrowing tradeoff: children build eagerly, so the org
  // lookup runs even on the non-happy branches DataShell discards (ui/README).
  const org = data?.find((candidate) => candidate.id === orgId);
  return (
    <DataShell
      isLoading={isLoading}
      isError={isError || !data}
      errorText="Unable to load organization."
    >
      {org ? (
        <Card padding="lg">
          <dl className="grid gap-6 sm:grid-cols-3">
            <div>
              <dt className="text-label text-muted uppercase">Name</dt>
              <dd className="mt-1.5 text-body text-ink">{org.name}</dd>
            </div>
            <div>
              <dt className="text-label text-muted uppercase">Slug</dt>
              <dd className="mt-1.5 text-body text-ink-soft">{org.slug}</dd>
            </div>
            <div>
              <dt className="text-label text-muted uppercase">Your role</dt>
              <dd className="mt-1.5">
                <Badge>{org.role}</Badge>
              </dd>
            </div>
          </dl>
        </Card>
      ) : (
        <p className="text-sm text-muted">
          This organization isn't in your list.
        </p>
      )}
    </DataShell>
  );
}

export function SettingsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Settings" />
      <Section label="Organization">
        <OrganizationCard orgId={orgId} />
      </Section>
      <Section label="Guardrails" className="mt-10">
        <Card padding="lg">
          <p className="text-sm text-muted">
            Quiet-hours and autonomy controls will live here once the
            guardrail-config API ships — it's on the backend wave. The
            quiet-hours guardrail already runs server-side; there's nothing to
            configure from the console yet.
          </p>
        </Card>
      </Section>
    </div>
  );
}
