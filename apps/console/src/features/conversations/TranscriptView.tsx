// S7.1 — tenant transcript text renders as inert, escaped text nodes: a contact can literally
// speak "<script>" and it surfaces as visible characters, never markup. This file never builds
// markup strings and never sets raw HTML. Content is VERBATIM — transcripts are evidence-grade
// tenant data; no sanitizer may rewrite them (escaping alone makes them inert, test-pinned).
export type TranscriptMessage = {
  seq: number;
  role: "agent" | "contact" | "human_agent" | "system" | "tool";
  content: string | null;
  ts: string | null;
};

export function TranscriptView({
  messages,
}: {
  messages: TranscriptMessage[];
}) {
  return (
    <ul className="space-y-2">
      {messages.map((m) => (
        <li key={m.seq} className="rounded border border-gray-200 p-3">
          <span className="text-xs font-medium text-gray-500">{m.role}</span>
          <p className="mt-1 text-sm text-gray-900">{m.content ?? "—"}</p>
        </li>
      ))}
    </ul>
  );
}
