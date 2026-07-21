// Layout barrel for PAGES: PageHeader + Section only. AppShell/Sidebar/Topbar are
// deliberately NOT exported here — the router owns the shell (see AppShell.tsx); a page
// importing the shell would create an import cycle through the routes manifest.
export { PageHeader } from "./PageHeader";
export { Section } from "./Section";
