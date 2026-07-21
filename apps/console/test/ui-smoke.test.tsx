// Design-system smoke — env-free by construction (imitates tests/transcript-xss.test.tsx:
// bun test + renderToStaticMarkup, no DOM library, no DB/network, no new deps). Proves the
// ui/ vocabulary actually renders: primitives carry their token classes, every registered
// icon renders an aria-hidden svg, and AppShell draws the sidebar nav with the active fill.
// Deeper interaction testing needs a DOM runner — a separate BOM decision, not taken here.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import { icons } from "../src/ui/icons";
import { AppShell } from "../src/ui/layout/AppShell";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  IconButton,
} from "../src/ui/primitives";

describe("ui primitives render with token classes", () => {
  it("Button: pill radius, primary = ink fill, explicit type", () => {
    const html = renderToStaticMarkup(<Button>Create</Button>);
    expect(html).toContain("rounded-pill");
    expect(html).toContain("bg-ink");
    expect(html).toContain('type="button"');
    expect(html).toContain("Create");
  });

  it("Button secondary: outline pill on surface", () => {
    const html = renderToStaticMarkup(
      <Button variant="secondary">Sign out</Button>,
    );
    expect(html).toContain("border-line");
    expect(html).toContain("bg-surface");
  });

  it("IconButton: circular, keeps its required aria-label", () => {
    const Send = icons.send;
    const html = renderToStaticMarkup(
      <IconButton aria-label="Send" size="lg">
        <Send />
      </IconButton>,
    );
    expect(html).toContain('aria-label="Send"');
    expect(html).toContain("rounded-pill");
    expect(html).toContain("<svg");
  });

  it("Badge tones: neutral fill vs sparing gold accent", () => {
    expect(renderToStaticMarkup(<Badge>lead</Badge>)).toContain(
      "bg-nav-active",
    );
    expect(renderToStaticMarkup(<Badge tone="accent">active</Badge>)).toContain(
      "bg-accent-soft",
    );
  });

  it("Card: card radius + hairline + soft shadow", () => {
    const html = renderToStaticMarkup(<Card>content</Card>);
    expect(html).toContain("rounded-card");
    expect(html).toContain("border-line");
    expect(html).toContain("shadow-card");
  });

  it("Chip: a real button in a pill", () => {
    const html = renderToStaticMarkup(<Chip>Review open tasks</Chip>);
    expect(html).toContain("<button");
    expect(html).toContain("rounded-pill");
  });

  it("Avatar: initials + accessible name", () => {
    const html = renderToStaticMarkup(<Avatar name="Ada Lovelace" />);
    expect(html).toContain("AL");
    expect(html).toContain('aria-label="Ada Lovelace"');
  });
});

describe("icon registry", () => {
  it("every registered icon renders a decorative line svg", () => {
    for (const [name, Icon] of Object.entries(icons)) {
      const html = renderToStaticMarkup(<Icon />);
      expect(html).toContain("<svg");
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('stroke="currentColor"');
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

describe("AppShell", () => {
  const nav = [
    { path: "home", label: "Home", icon: "home", section: "Workspace" },
    { path: "tasks", label: "Tasks", icon: "tasks", section: "Workspace" },
    {
      path: "dashboard",
      label: "Dashboard",
      icon: "analytics",
      section: "Insights",
    },
  ] as const;

  it("renders wordmark, grouped nav with active fill, actions, and content", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/o/org-1/home">
        <Route path="/o/:orgId/home">
          <AppShell
            nav={[...nav]}
            actions={<Button variant="secondary">Sign out</Button>}
          >
            <p>page content</p>
          </AppShell>
        </Route>
      </Router>,
    );
    expect(html).toContain("Revenue OS"); // wordmark
    expect(html).toContain("Workspace"); // section labels
    expect(html).toContain("Insights");
    expect(html).toContain('href="/o/org-1/home"'); // nav links carry the org
    expect(html).toContain('href="/o/org-1/tasks"');
    expect(html).toContain("bg-nav-active"); // active item soft fill
    expect(html).toContain("bg-canvas"); // shell sits on the warm canvas
    expect(html).toContain("page content");
    expect(html).toContain("Sign out");
  });
});
