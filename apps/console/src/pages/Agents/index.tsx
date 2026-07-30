// /o/:orgId/agents — the org's agents and their workflows on real data (task 50; the /agents
// endpoint is now live). Server state via useAgentsQuery (features/agents/api, R2); org context
// from the URL (R7). Loading / error / empty go through <DataShell> — no data reads as unavailable,
// never as a fabricated empty list; a truly unconfigured org gets the honest "No agents…" copy.
// Both lists render through the <Table> suite (ui/README skeleton), tokens only. All text renders
// as inert text nodes (S7.1).
import { useParams } from "wouter";
import { useAgentsQuery } from "../../features/agents/api";
import { PageHeader, Section } from "../../ui/layout";
import {
  Badge,
  Card,
  DataShell,
  Row,
  Table,
  TD,
  TH,
  THead,
} from "../../ui/primitives";

export function AgentsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data, isLoading, isError } = useAgentsQuery(orgId);
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Agents"
        description="Voice & messaging agents and their workflows"
      />
      <DataShell
        isLoading={isLoading}
        isError={isError || !data}
        isEmpty={data?.agents.length === 0 && data?.workflows.length === 0}
        emptyText="No agents or workflows configured yet."
      >
        <Section label="Agents">
          <Card padding="lg">
            <Table>
              <THead>
                <TH>Key</TH>
                <TH>Status</TH>
                <TH>Model</TH>
                <TH>Version</TH>
              </THead>
              <tbody>
                {data?.agents.map((agent) => (
                  <Row key={agent.id}>
                    <TD tone="ink" className="font-medium">
                      {agent.key}
                    </TD>
                    <TD>
                      <Badge
                        tone={agent.status === "active" ? "accent" : "neutral"}
                      >
                        {agent.status}
                      </Badge>
                    </TD>
                    <TD>{agent.model}</TD>
                    <TD>{agent.version}</TD>
                  </Row>
                ))}
              </tbody>
            </Table>
          </Card>
        </Section>
        <Section label="Workflows" className="mt-10">
          <Card padding="lg">
            <Table>
              <THead>
                <TH>Key</TH>
                <TH>Status</TH>
                <TH>Version</TH>
              </THead>
              <tbody>
                {data?.workflows.map((workflow) => (
                  <Row key={workflow.id}>
                    <TD tone="ink" className="font-medium">
                      {workflow.key}
                    </TD>
                    <TD>
                      <Badge
                        tone={
                          workflow.status === "active" ? "accent" : "neutral"
                        }
                      >
                        {workflow.status}
                      </Badge>
                    </TD>
                    <TD>{workflow.version}</TD>
                  </Row>
                ))}
              </tbody>
            </Table>
          </Card>
        </Section>
      </DataShell>
    </div>
  );
}
