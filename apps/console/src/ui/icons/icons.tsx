// Hand-authored 24×24 line icons (stroke 1.6, round caps) — NO icon package (no-new-deps
// rail). Decorative by default: aria-hidden + focusable=false; pair with visible text or
// an aria-label on the interactive parent. Add new icons here + register in ./index.ts.
import type { ComponentProps } from "react";

export type IconProps = ComponentProps<"svg"> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 9.8V20h4.6v-5h2.8v5H18V9.8" />
    </Svg>
  );
}

export function TasksIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 6h9" />
      <path d="M11 12h9" />
      <path d="M11 18h9" />
      <path d="M4 5.5l1.5 1.5L8 4.5" />
      <path d="M4 11.5l1.5 1.5L8 10.5" />
      <path d="M4 17.5l1.5 1.5L8 16.5" />
    </Svg>
  );
}

export function ConversationsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" />
    </Svg>
  );
}

export function ContactsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 5.4a3.2 3.2 0 0 1 0 5.9" />
      <path d="M17.5 14.6a5.5 5.5 0 0 1 3 4.9" />
    </Svg>
  );
}

export function AgentsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5l1.9 4.9 4.9 1.9-4.9 1.9L12 17.1l-1.9-4.9-4.9-1.9 4.9-1.9L12 3.5Z" />
      <path d="M18.7 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" />
    </Svg>
  );
}

export function AnalyticsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 20v-7" />
      <path d="M12 20V5" />
      <path d="M19 20v-11" />
      <path d="M3.5 20h17" />
    </Svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h10" />
      <path d="M18.4 7H20" />
      <circle cx="16.2" cy="7" r="2.2" />
      <path d="M4 17h1.6" />
      <path d="M10 17h10" />
      <circle cx="7.8" cy="17" r="2.2" />
    </Svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 19V5.5" />
      <path d="M6.5 11L12 5.5 17.5 11" />
    </Svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h10" />
    </Svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 12h15" />
      <path d="M13.5 6l6 6-6 6" />
    </Svg>
  );
}
