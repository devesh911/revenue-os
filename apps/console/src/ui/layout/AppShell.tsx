// The app frame: white sidebar + topbar + content column on the warm canvas.
// ROUTER-ONLY — pages never import AppShell (src/app/router.tsx wraps every routed
// element in it); pages compose PageHeader/Section/primitives inside the content slot.
// Kept out of the ui/layout barrel so the pages → layout import graph stays acyclic.
import type { ReactNode } from "react";
import { Sidebar, type SidebarNavEntry } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({
  nav,
  title,
  actions,
  user,
  children,
}: {
  nav: SidebarNavEntry[];
  title?: ReactNode;
  actions?: ReactNode;
  user?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar nav={nav} footer={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} actions={actions} />
        <main className="flex-1 px-8 pb-12">{children}</main>
      </div>
    </div>
  );
}
