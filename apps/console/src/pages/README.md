# pages — routed page surfaces

One folder per routed page (`Home/`, `Tasks/`, `Conversations/`, `Contacts/`, `Dashboard/`,
`Agents/`, `Settings/`, `Transcript/`), each an `index.tsx` exporting a `<Name>Page`.

Pages are COMPOSITION only: they read server state from a `features/*` query hook (R2, Zod-parsed),
take org context from the URL (`useParams`, R7), and lay the result out with `ui/` primitives and
layout. A page never defines colors, spacing, radii, or table markup — if a primitive is missing,
extend `ui/` in its own commit, don't inline a one-off (see `../ui/README.md`). Loading / error /
empty go through `<DataShell>`; tabular data through the `<Table>` suite.

To add a page, follow the whole procedure in `../ui/README.md` ("Adding a page"): create the
folder, build from primitives + hooks, and append ONE entry to `../routes.tsx`. That single entry
wires both the sidebar and the router — never touch `app/router.tsx` for a new page.
