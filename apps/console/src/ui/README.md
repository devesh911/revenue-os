# Console design system — the contract

Calm, warm-neutral, monochrome + ONE gold accent. White sidebar and cards on a warm
off-white canvas; near-black ink; hairline borders; soft shadows; pill buttons; thin
line icons; big tight-bold headings; small uppercase gray section labels; generous
whitespace.

**The rule for page-agents: you NEVER redefine colors, spacing, radii, shadows, type
sizes, or buttons. You compose the tokens and components on this page — nothing else.**
No raw hex, no `gray-*`/`blue-*`/`slate-*`, no `rounded-md`, no ad-hoc `shadow`, no new
button markup. If a primitive is missing, extend `ui/` in its own commit — don't inline
a one-off in a page.

## Tokens (defined in `src/index.css` `@theme`)

Light theme only today; dark is a later token swap — which only works if every component
goes through these names.

| Token | Utility | Use for |
|---|---|---|
| `canvas` `#F4F1EA` | `bg-canvas` | the page background (AppShell sets it) |
| `surface` `#FFFFFF` | `bg-surface` | sidebar, cards, inputs, pills |
| `ink` `#171717` | `text-ink`, `bg-ink` | headings, primary text, primary buttons |
| `ink-soft` `#3D3D3D` | `text-ink-soft` | secondary text, table cells, hover of ink |
| `muted` `#8B8781` | `text-muted` | labels, captions, placeholders, empty/loading copy |
| `line` `#E7E3DC` | `border-line` | ALL borders (hairline, warm gray) |
| `nav-active` `#ECE8E1` | `bg-nav-active` | active nav fill, hovers, neutral badge bg |
| `accent` `#B87A2B` | `text-accent`, `bg-accent`, `outline-accent` | the ONE gold — focus rings, live badges, the wordmark dot. Sparingly. |
| `accent-soft` `#F2E7D5` | `bg-accent-soft` | gold-tinted fills (accent badge bg, selection) |
| `danger` `#B3402A` | `text-danger` | error text only (warm brick, not pure red) |

Radii: `rounded-pill` (buttons/chips/badges/avatars) · `rounded-card` 14px (cards) ·
`rounded-control` 10px (inputs/textareas) · `rounded-nav` 8px (nav items).
Shadows: `shadow-card` (default surface) · `shadow-pop` (hero ask bar, popovers).

Type scale (size + weight + tracking bundled into one utility):
`text-hero` 52/800 tight (Home hero ONLY) · `text-h1` 32/700 (page titles — PageHeader
sets it) · `text-h2` 22/700 (card/modal titles) · `text-body` 15/450 (default body; the
`body` element already sets it) · `text-label` 12/500 +0.06em — always compose as
`text-label text-muted uppercase` (Section and table headers do this for you).
In-between sizes: use `text-sm` (14) and `text-xs` (12) with token colors.

## Primitives (`import { … } from "../../ui/primitives"`)

- **Button** — `variant: "primary" | "secondary" | "ghost"` (default `primary`),
  `size: "sm" | "md"`, `icon?: ReactNode` (leading, ~16px), + native button props.
  ONE black `primary` per view; `secondary` is the outline pill; `ghost` for tertiary.
  `<Button variant="secondary" size="sm" icon={<PlusIcon size={15} />}>New task</Button>`
- **IconButton** — circular; `aria-label` REQUIRED; `variant` as Button;
  `size: "sm" | "md" | "lg"`; child = one line icon.
  `<IconButton aria-label="Send" size="lg"><SendIcon size={19} /></IconButton>`
- **Input / Textarea** — skinned native controls; give an accessible name.
  `<Input placeholder="Search contacts…" aria-label="Search contacts" />`
- **Card** — white surface, card radius, hairline border, soft shadow;
  `padding: "none" | "md" | "lg"` (default `md`).
  `<Card padding="lg"><table …/></Card>`
- **Badge** — status pill; `tone: "neutral" | "accent" | "danger"` (default neutral).
  Gold `accent` = the one live/new thing. `<Badge tone="accent">active</Badge>`
- **Chip** — suggestion/quick-action pill (a real `<button>`); `icon?` leading.
  `<Chip icon={<TasksIcon size={15} />} onClick={…}>Review open tasks</Chip>`
- **Avatar** — initials circle; `name: string`, `size: "sm" | "md"`.
  `<Avatar name={contactName} size="sm" />`

## Layout (`import { PageHeader, Section } from "../../ui/layout"`)

- **AppShell** — sidebar + topbar + content. ROUTER-ONLY: pages never import it; the
  router already wraps every routed element (and would double-render the chrome if a
  page did it again). Not exported from the barrel on purpose.
- **PageHeader** — `title`, `description?`, `actions?` (right-aligned pills). Every
  page (except Home's hero) starts with one.
- **Section** — `label` (renders uppercase-muted), `actions?`, `children`. For content
  clusters like "Recent conversations".

Page skeleton:

```tsx
export function ThingsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data, isLoading, isError } = useThingsQuery(orgId); // features/*/api.ts (R2)
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Things"
        actions={<Button icon={<PlusIcon size={15} />}>New thing</Button>}
      />
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : isError || !data ? (
        <p className="text-sm text-muted">Unable to load data.</p>
      ) : (
        <Card padding="lg">…</Card>
      )}
    </div>
  );
}
```

## Icons (`import { HomeIcon, … } from "../../ui/icons"`)

Hand-authored 24×24 line icons (stroke 1.6): `home tasks conversations contacts agents
analytics settings send menu user plus arrow-right`. Each takes `size?` (default 18)
plus svg props; `aria-hidden` by default, so pair with text or a labelled parent. The
`icons` map + `IconName` type back the routes manifest. New icon: author the paths in
`ui/icons/icons.tsx` (no icon packages — hard rail), register it in `ui/icons/index.ts`.

## Adding a page (the whole procedure)

1. Create `src/pages/<Name>/index.tsx` exporting `<Name>Page`, built from primitives +
   layout + your feature's query hooks (`features/<name>/api.ts`, Zod-parsed — R2/R6).
   Handle loading / error / empty where the data lands. No `dangerouslySetInnerHTML`
   (S7.1 sweep fails the build otherwise).
2. Append ONE entry to `src/routes.tsx` at the `// add your page here` anchor:
   `{ path: "things", label: "Things", icon: "tasks", element: <ThingsPage />, section: "Workspace" }`.
   Do not reorder or edit existing entries (parallel branches merge cleanly only if
   everyone appends). `hidden: true` for detail routes; params allowed in `path`.
3. That's it — the Sidebar and the router both read the manifest. Never touch
   `app/router.tsx` or the AppShell wiring for a new page.

## Restyling the legacy screens (read before touching `src/screens/`)

`screens/index.tsx`, `screens/ContactsTable.tsx` and `screens/ConversationLink.tsx` are
PATH- and SOURCE-pinned by `tests/conversation-link.test.tsx` /
`tests/console-contact-links.test.tsx` (ConversationLink import + usage, no inline
deep-link literal, and ConversationLink's exact anchor markup — including its
`text-blue-600 hover:underline` class). Restyle those pages by REBUILDING their
`pages/*` wrapper with primitives; retiring or re-skinning the pinned files (e.g.
turning the blue link gold) requires updating those tests in the same PR.
