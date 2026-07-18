// Icon barrel + name registry. The routes manifest (src/routes.tsx) refers to icons by
// IconName so the Sidebar can render them; components may also import icon components
// directly. New icon: author it in ./icons.tsx, then register it here.
import {
  AgentsIcon,
  AnalyticsIcon,
  ArrowRightIcon,
  ContactsIcon,
  ConversationsIcon,
  HomeIcon,
  MenuIcon,
  PlusIcon,
  SendIcon,
  SettingsIcon,
  TasksIcon,
  UserIcon,
} from "./icons";

export type { IconProps } from "./icons";
export {
  AgentsIcon,
  AnalyticsIcon,
  ArrowRightIcon,
  ContactsIcon,
  ConversationsIcon,
  HomeIcon,
  MenuIcon,
  PlusIcon,
  SendIcon,
  SettingsIcon,
  TasksIcon,
  UserIcon,
};

export const icons = {
  home: HomeIcon,
  tasks: TasksIcon,
  conversations: ConversationsIcon,
  contacts: ContactsIcon,
  agents: AgentsIcon,
  analytics: AnalyticsIcon,
  settings: SettingsIcon,
  send: SendIcon,
  menu: MenuIcon,
  user: UserIcon,
  plus: PlusIcon,
  "arrow-right": ArrowRightIcon,
} as const;

export type IconName = keyof typeof icons;
