// Route surface for /o/:orgId/contacts. Implementation stays at src/screens/index.tsx
// (ContactTimeline) + src/screens/ContactsTable.tsx — both path+source test-pinned
// (tests/console-contact-links.test.tsx, tests/conversation-link.test.tsx); see
// pages/Tasks/index.tsx for the full note. Page-fleet restyles by rebuilding this file.
export { ContactTimeline as ContactsPage } from "../../screens";
