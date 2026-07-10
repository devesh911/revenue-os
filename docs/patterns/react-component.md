# Pattern: React component tiers (dev-workflow R1–R8)
```tsx
// components/ui/Badge.tsx — dumb primitive: typed props, tokens only, no logic beyond display
export function Badge({ tone = "neutral", children }: { tone?: "neutral"|"success"|"danger"; children: React.ReactNode }) {
  const t = { neutral: "bg-plot text-ink-soft", success: "bg-sage-soft text-sage", danger: "bg-brick-soft text-brick" }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-mono ${t}`}>{children}</span>;
}

// features/tasks/components/TaskRow.tsx — feature component: composes ui/, calls feature hooks, no fetching inside
export function TaskRow({ task }: { task: Task }) {              // Task type from @shared — never re-declared (R6)
  const claim = useClaimTaskMutation();                          // from features/tasks/api.ts (R2)
  return (
    <Card onClick={() => claim.mutate(task.id)}>
      <span>{task.title}</span>
      <Badge tone={task.priority > 80 ? "danger" : "neutral"}>{task.priority}</Badge>
      <DynamicFields defs={task.customFields} values={task.attributes} />  {/* R5: config renders, JSX never copied */}
    </Card>
  );
}
```
Rules: ≤150 lines or extract · second usage → promote · loading/empty/error handled where data lands · screens only compose.
