// Left rail (~240px): wordmark, grouped nav (uppercase section label; items = line icon
// + label; active = soft rounded fill), and a footer slot (user chip) pinned at the
// bottom. Nav entries arrive as PROPS (the router passes the routes manifest) so ui/
// never imports app code — pure vocabulary, no data fetching.
import { Link, useLocation, useParams } from "wouter";
import { cx } from "../cx";
import { type IconName, icons } from "../icons";

export type SidebarNavEntry = {
  path: string;
  label: string;
  icon: IconName;
  section: string;
};

function groupBySection(
  nav: SidebarNavEntry[],
): Array<{ section: string; items: SidebarNavEntry[] }> {
  const groups: Array<{ section: string; items: SidebarNavEntry[] }> = [];
  for (const item of nav) {
    const last = groups[groups.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}

function NavItem({ item }: { item: SidebarNavEntry }) {
  const { orgId } = useParams<{ orgId: string }>();
  const [location] = useLocation();
  const href = `/o/${orgId}/${item.path}`;
  const active = location === href || location.startsWith(`${href}/`);
  const Icon = icons[item.icon];
  return (
    <li>
      <Link
        href={href}
        className={cx(
          "flex items-center gap-2.5 rounded-nav px-2.5 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-nav-active text-ink"
            : "text-ink-soft hover:bg-nav-active/60 hover:text-ink",
        )}
      >
        <Icon size={17} className={active ? "text-ink" : "text-muted"} />
        {item.label}
      </Link>
    </li>
  );
}

export function Sidebar({
  nav,
  footer,
}: {
  nav: SidebarNavEntry[];
  footer?: React.ReactNode;
}) {
  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2 px-5 pt-6 pb-5">
        <span aria-hidden="true" className="h-2 w-2 rounded-pill bg-accent" />
        <span className="text-[17px] font-bold tracking-tight">Revenue OS</span>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-1">
        {groupBySection(nav).map((group) => (
          <div key={group.section}>
            <p className="px-2.5 pb-2 text-label text-muted uppercase">
              {group.section}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem key={item.path} item={item} />
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {footer ? <div className="border-t border-line p-3">{footer}</div> : null}
    </aside>
  );
}
