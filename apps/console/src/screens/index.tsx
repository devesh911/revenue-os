// The four V1 screens (D4/architecture E) — empty shells; features fill them in P3.
function Shell({ title, blurb }: { title: string; blurb: string }) {
  return (
    <section className="p-8">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-gray-500">{blurb}</p>
    </section>
  );
}

export function TaskQueue() {
  return (
    <Shell
      title="Task queue"
      blurb="Open callbacks and approvals, ranked by priority. (P3)"
    />
  );
}
export function LiveMonitor() {
  return (
    <Shell
      title="Live monitor"
      blurb="Active conversations with takeover. (P3)"
    />
  );
}
export function ContactTimeline() {
  return (
    <Shell
      title="Contacts"
      blurb="Contact timeline + disposition tagging. (P3)"
    />
  );
}
export function Dashboard() {
  return <Shell title="Dashboard" blurb="The six funnel metrics. (P3)" />;
}
