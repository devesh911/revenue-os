// THE ROUTE MANIFEST — pages self-register here; the Sidebar (nav) and the router
// (Switch) both read this array, so one appended entry = a fully wired page.
//
//   path     URL segment(s) under /o/:orgId/ — params allowed ("conversations/:id")
//   label    sidebar text
//   icon     name from ui/icons (the Sidebar renders it)
//   element  the page element (build pages from ui/ primitives ONLY — see ui/README.md)
//   section  sidebar group (new section name → new group, order of first appearance)
//   hidden   true → routed but not in the sidebar (detail pages like Transcript)
//
// Page-fleet: append ONE entry at the anchor comment below; never reorder or edit
// existing lines (keeps parallel-branch merges conflict-free).
import type { ReactNode } from "react";
import { AgentsPage } from "./pages/Agents";
import { ContactsPage } from "./pages/Contacts";
import { ConversationsPage } from "./pages/Conversations";
import { DashboardPage } from "./pages/Dashboard";
import { HomePage } from "./pages/Home";
import { SettingsPage } from "./pages/Settings";
import { TasksPage } from "./pages/Tasks";
import { TranscriptPage } from "./pages/Transcript";
import type { IconName } from "./ui/icons";

export type ConsoleRoute = {
  path: string;
  label: string;
  icon: IconName;
  element: ReactNode;
  section: string;
  hidden?: boolean;
};

export const routes: ConsoleRoute[] = [
  {
    path: "home",
    label: "Home",
    icon: "home",
    element: <HomePage />,
    section: "Workspace",
  },
  {
    path: "tasks",
    label: "Tasks",
    icon: "tasks",
    element: <TasksPage />,
    section: "Workspace",
  },
  {
    path: "live",
    label: "Conversations",
    icon: "conversations",
    element: <ConversationsPage />,
    section: "Workspace",
  },
  {
    path: "contacts",
    label: "Contacts",
    icon: "contacts",
    element: <ContactsPage />,
    section: "Workspace",
  },
  {
    path: "dashboard",
    label: "Analytics",
    icon: "analytics",
    element: <DashboardPage />,
    section: "Insights",
  },
  {
    path: "conversations/:conversationId",
    label: "Transcript",
    icon: "conversations",
    element: <TranscriptPage />,
    section: "Workspace",
    hidden: true,
  },
  {
    path: "agents",
    label: "Agents",
    icon: "agents",
    element: <AgentsPage />,
    section: "Workspace",
  },
  {
    path: "settings",
    label: "Settings",
    icon: "settings",
    element: <SettingsPage />,
    section: "Account",
  },
  // add your page here — append one entry above this line, nothing else.
];
