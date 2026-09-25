// Console sign-in front door — RED spec for the sign-in form's markup (AC-C4). LoginView is pure
// (all state comes in as props), so its accessibility and browser-autofill contract is checked on
// SSR markup: real <label>s tied to the inputs (screen readers + click-to-focus), the attributes
// password managers key on (name, autocomplete, required, input type), a submit button that is
// disabled and says "Signing in…" while a request is in flight (no double submits), and errors
// announced through role="alert". Env-free: renderToStaticMarkup, no DOM library; loaded per test.
import { describe, expect, it } from "bun:test";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "./router";
import { text } from "./test-utils";

type LoginViewProps = {
  email: string;
  password: string;
  pending: boolean;
  error: string | null;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit: (event?: unknown) => void;
};

const noop = () => {};

async function renderLogin(
  over: Partial<LoginViewProps> = {},
): Promise<string> {
  const { LoginView } = (await import("../src/app/session/LoginView")) as {
    LoginView: ComponentType<LoginViewProps>;
  };
  return renderToStaticMarkup(
    <StaticRouter>
      <LoginView
        email="dev@local.test"
        password=""
        pending={false}
        error={null}
        onEmail={noop}
        onPassword={noop}
        onSubmit={noop}
        {...over}
      />
    </StaticRouter>,
  );
}

type Attrs = Record<string, string>;

// Attributes of every <tag …> opening tag in the markup (boolean attributes map to ""). Names are
// lowercased because HTML attribute names are case-insensitive and React 19.2 SSR writes some in
// camelCase (it emits `autoComplete="email"`, which browsers read as autocomplete).
const openTags = (html: string, tag: string): Attrs[] =>
  [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "g"))].map((m) =>
    Object.fromEntries(
      [...(m[1] ?? "").matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].map((a) => [
        (a[1] ?? "").toLowerCase(),
        a[2] ?? "",
      ]),
    ),
  );

// The <input> that a <label> reading exactly `label` is tied to — by for/id, or by wrapping it.
function inputForLabel(html: string, label: string): Attrs | undefined {
  for (const m of html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)) {
    const inner = m[2] ?? "";
    if (text(inner).trim() !== label) continue;
    const wrapped = openTags(inner, "input")[0];
    if (wrapped) return wrapped;
    const forId = (m[1] ?? "").match(/\bfor="([^"]+)"/)?.[1];
    if (forId) return openTags(html, "input").find((i) => i.id === forId);
  }
  return undefined;
}

// The form's submit button: its attributes and visible label.
function submitButton(
  html: string,
): { attrs: Attrs; label: string } | undefined {
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attrs = openTags(`<button${m[1] ?? ""}>`, "button")[0] ?? {};
    if (attrs.type === "submit")
      return { attrs, label: text(m[2] ?? "").trim() };
  }
  return undefined;
}

describe("LoginView — sign-in form markup (AC-C4)", () => {
  // AC-C4 — heading, and a <form> to submit.
  it("AC-C4: renders the 'Sign in to Revenue OS' heading inside a form page", async () => {
    const html = await renderLogin();
    expect(html).toMatch(/<h[12]\b[^>]*>\s*Sign in to Revenue OS\s*<\/h[12]>/);
    expect(html).toContain("<form");
  });

  // AC-C4 — Email: a real label tied to an email input with name, required, autocomplete="email".
  it("AC-C4: 'Email' label is tied to an email input with name, required and autocomplete=email", async () => {
    const input = inputForLabel(await renderLogin(), "Email");
    expect(input).toBeDefined();
    expect(input?.type).toBe("email");
    expect(input?.name?.length ?? 0).toBeGreaterThan(0);
    expect(input).toHaveProperty("required");
    expect(input?.autocomplete).toBe("email");
    expect(input?.value).toBe("dev@local.test"); // controlled by the email prop
  });

  // AC-C4 — Password: a real label tied to a password input with autocomplete="current-password".
  it("AC-C4: 'Password' label is tied to a password input with name, required and autocomplete=current-password", async () => {
    const html = await renderLogin();
    const input = inputForLabel(html, "Password");
    expect(input).toBeDefined();
    expect(input?.type).toBe("password");
    expect(input?.name?.length ?? 0).toBeGreaterThan(0);
    expect(input).toHaveProperty("required");
    expect(input?.autocomplete).toBe("current-password");
    expect(input?.name).not.toBe(inputForLabel(html, "Email")?.name); // two distinct fields
  });

  // AC-C4 — idle: an enabled "Sign in" submit button.
  it("AC-C4: idle → an enabled submit button reading 'Sign in'", async () => {
    const button = submitButton(await renderLogin());
    expect(button?.label).toBe("Sign in");
    expect(button?.attrs).not.toHaveProperty("disabled");
  });

  // AC-C4 — pending: the submit button is disabled and reads "Signing in…".
  it("AC-C4: pending → the submit button is disabled and reads 'Signing in…'", async () => {
    const button = submitButton(await renderLogin({ pending: true }));
    expect(button?.label).toBe("Signing in…");
    expect(button?.attrs).toHaveProperty("disabled");
  });

  // AC-C4 — an error is announced in an element with role="alert"; no error, no message.
  it("AC-C4: an error renders inside a role=alert element", async () => {
    const message = "Email or password is incorrect.";
    const html = await renderLogin({ error: message });
    const alert = html.match(
      /role="alert"[^>]*>([\s\S]*?)<\/(?!span|strong|em)/,
    );
    expect(alert).not.toBeNull();
    expect(text(alert?.[1] ?? "")).toContain(message);
    expect(text(await renderLogin())).not.toContain(message);
  });
});
