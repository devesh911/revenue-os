// Settings — org info from the orgs hook (R2), plus the live Guardrails section (task-52): GET for
// any member, PUT admin-only. quiet_hours + autonomy are EDITABLE (a form / a per-tool <select>);
// attempt_caps + dnc render READ-ONLY. Every value comes from the server — nothing is fabricated
// when there's no data. The mutation validates against the shared GuardrailPolicyInputSchema
// (the harness reads quiet_hours config FAIL-OPEN, so that Zod is the real safety boundary).
import type { ReactNode } from "react";
import { useParams } from "wouter";
import {
  type GuardrailPoliciesResponse,
  useGuardrailPoliciesQuery,
  useUpdateGuardrailPolicy,
} from "../../features/guardrails/api";
import { useOrgsQuery } from "../../features/orgs/api";
import { PageHeader, Section } from "../../ui/layout";
import { Badge, Button, Card, DataShell, Input } from "../../ui/primitives";

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

const GUARDRAIL_LABELS: Record<string, string> = {
  quiet_hours: "Quiet hours",
  attempt_caps: "Attempt caps",
  dnc: "Do not contact",
  autonomy: "Autonomy",
};
const AUTONOMY_TIERS = ["auto", "approval", "forbidden"] as const;
const SELECT_CLASS =
  "h-10 w-full rounded-control border border-line bg-surface px-3.5 text-sm text-ink outline-none transition-colors focus:border-ink/40";

const asStr = (v: unknown): string => (typeof v === "string" ? v : "");
const capText = (cap: unknown): string => {
  const c = cap as { max?: number; per_hours?: number };
  return `up to ${c.max} every ${c.per_hours}h`;
};

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-label text-muted uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}

type GuardrailPolicy = GuardrailPoliciesResponse["policies"][number];

function GuardrailsCard({ orgId }: { orgId: string }) {
  const { data, isLoading, isError } = useGuardrailPoliciesQuery(orgId);
  const update = useUpdateGuardrailPolicy(orgId);
  const policies = data?.policies ?? [];

  // Not a hook — a plain per-policy renderer that closes over `update`. quiet_hours + autonomy are
  // editable (each its own <form> with a single submit); attempt_caps + dnc are read-only text.
  function body(policy: GuardrailPolicy) {
    const config = policy.config;
    switch (policy.key) {
      case "quiet_hours":
        return (
          <form
            className="grid gap-4 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              update.mutate({
                key: "quiet_hours",
                config: {
                  start: asStr(f.get("start")),
                  end: asStr(f.get("end")),
                  tz: asStr(f.get("tz")),
                },
                active: policy.active,
              });
            }}
          >
            <Field id="qh-start" label="Start">
              <Input
                id="qh-start"
                name="start"
                type="time"
                defaultValue={asStr(config.start)}
              />
            </Field>
            <Field id="qh-end" label="End">
              <Input
                id="qh-end"
                name="end"
                type="time"
                defaultValue={asStr(config.end)}
              />
            </Field>
            <Field id="qh-tz" label="Timezone">
              <Input id="qh-tz" name="tz" defaultValue={asStr(config.tz)} />
            </Field>
            <Button type="submit" variant="secondary" size="sm">
              Save
            </Button>
          </form>
        );
      case "autonomy":
        return (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const next: Record<string, unknown> = {};
              for (const tool of Object.keys(config))
                next[tool] = asStr(f.get(tool));
              update.mutate({
                key: "autonomy",
                config: next,
                active: policy.active,
              });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.keys(config).map((tool) => (
                <Field key={tool} id={`autonomy-${tool}`} label={tool}>
                  <select
                    id={`autonomy-${tool}`}
                    name={tool}
                    defaultValue={asStr(config[tool])}
                    className={SELECT_CLASS}
                  >
                    {AUTONOMY_TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <div>
              <Button type="submit" variant="secondary" size="sm">
                Save
              </Button>
            </div>
          </form>
        );
      case "attempt_caps":
        return (
          <dl className="grid gap-2 sm:grid-cols-2">
            {Object.entries(config).map(([channel, cap]) => (
              <div
                key={channel}
                className="flex items-baseline justify-between gap-3"
              >
                <dt className="text-body text-ink">{channel}</dt>
                <dd className="text-sm text-ink-soft">{capText(cap)}</dd>
              </div>
            ))}
          </dl>
        );
      case "dnc":
        return (
          <p className="text-sm text-ink-soft">
            Hard stop {config.hard_stop === true ? "enabled" : "disabled"}.
          </p>
        );
      default:
        return null;
    }
  }

  return (
    <DataShell
      isLoading={isLoading}
      isError={isError || !data}
      isEmpty={policies.length === 0}
      errorText="Unable to load guardrails."
      emptyText="No guardrail policies are configured yet."
    >
      <div className="grid gap-4">
        {policies.map((policy) => (
          <Card key={policy.key} padding="lg">
            <h3 className="pb-3 text-body font-medium text-ink">
              {GUARDRAIL_LABELS[policy.key] ?? policy.key}
            </h3>
            {body(policy)}
          </Card>
        ))}
      </div>
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
        <GuardrailsCard orgId={orgId} />
      </Section>
    </div>
  );
}
