# screens — legacy V1 (do not build on these)

The four V1 screens (`index.tsx` — TaskQueue / LiveMonitor / ContactTimeline / Dashboard) plus the
shared leaves `ContactsTable.tsx` and `ConversationLink.tsx`. They predate the `pages/` + `ui/`
primitive fleet and carry a LIGHT skin only.

They are kept here on purpose: their PATHS and SOURCE/markup are pinned by
`tests/conversation-link.test.tsx` and `tests/console-contact-links.test.tsx` — the ConversationLink
import + usage with no inline deep-link literal, its exact `text-blue-600 hover:underline` anchor,
and the ContactsTable markup. Deleting or restyling these files breaks those tests.

Restyle/retirement is a QUEUED, coordinated-test task: rebuild the `pages/*` wrapper with primitives
and update the pinned tests in the same PR (see `../ui/README.md` "Restyling the legacy screens").
Until then, do NOT import from `screens/` in new pages.
