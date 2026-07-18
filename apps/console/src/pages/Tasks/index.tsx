// Route surface for /o/:orgId/tasks. The implementation intentionally stays at
// src/screens/index.tsx (TaskQueue): tests/conversation-link.test.tsx pins that file's
// path AND source (ConversationLink import/usage), so the component can't move without
// a coordinated test change. Page-fleet: a full restyle happens by rebuilding THIS file
// with ui/ primitives (and updating those tests in the same PR).
export { TaskQueue as TasksPage } from "../../screens";
