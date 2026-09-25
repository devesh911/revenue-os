# Roadmap

The plan, as vertical slices. Each slice ends in a **proof**: something real that Devesh can
watch happen. The **current slice** is the lowest-numbered slice that is not `done`, not
`proof ready`, and not blocked by anything unfinished. While a slice waits on Devesh — to watch
its proof or to supply something — agents move to the next unblocked slice. How items and
slices get marked done is in `AGENTS.md → Definition of done`.

Format (the tracker page reads this file, so keep it exact and keep every field and item on one
line): `## Slice N: title`, then the lines `Status:`, `Goal:`, `Proof:`, `Blocked by:`,
`Seen by Devesh:`, then checklist items `- [ ] text (agent)` or `(Devesh)`. A finished item
becomes `- [x] text (owner) · evidence: [#PR](link) and how it was seen working`.
Status is one of: `not started` · `in progress` · `proof ready` · `done`. Only Devesh writes a
date (YYYY-MM-DD) after `Seen by Devesh:`.

## Slice 0: One source of truth
Status: in progress
Goal: Anyone can tell in five minutes what the product is, what works, what is next and what is blocked.
Proof: Devesh opens NORTH-STAR, ROADMAP, STATE and the tracker page and can answer those four questions without asking anyone.
Blocked by: nothing
Seen by Devesh: —

- [x] Collapse the docs into four law files plus reference and archive (agent) · evidence: [#102](https://github.com/devesh911/revenue-os/pull/102)
- [x] Rewrite AGENTS.md around a definition of done that means "seen working" (agent) · evidence: [#102](https://github.com/devesh911/revenue-os/pull/102)
- [x] Tracker page that renders ROADMAP.md and STATE.md and flags format mistakes (agent) · evidence: [#102](https://github.com/devesh911/revenue-os/pull/102), parsers run against both files with zero problems
- [ ] Rewrite the examples in docs/patterns from real code (agent)

## Slice 1: Foundations the agent will stand on
Status: not started
Goal: Fix the database and engine faults that the next slices would otherwise copy into new features.
Proof: Devesh runs `bun run demo --keep` (one scripted lead taken from enrolment to a booked site visit) and in the console sees the booking counted on the dashboard and the call's outcome on the conversation; the agent then shows him a do-not-call lead being refused a message and an attempt to attach one company's record to another company being rejected.
Blocked by: nothing
Seen by Devesh: —

- [ ] When a lead says "don't contact me", record it, and block every later message and call to them (agent)
- [ ] Calling hours apply even when a company has saved no quiet-hours setting: a built-in legal window in the lead's time zone that company settings can only narrow (agent)
- [ ] The call-attempt limit allows exactly the configured number of calls (three today, not two) (agent)
- [ ] A company's contacts, conversations and sequences can only point at that same company's records (agent)
- [ ] Duplicate-message protection and call ids are kept per company, so two companies can never collide (agent)
- [ ] A lead can be in the same sequence only once at a time (agent)
- [ ] Messages stay in the right order when two things write to a conversation at once (agent)
- [ ] One agreed list of result names; the dashboard counts real bookings (agent)
- [ ] Save each call's outcome (interested, not interested, call back…) on the conversation (agent)
- [ ] Conversations the engine starts get a start time and the right finished status (agent)
- [ ] A call blocked by a guardrail is re-scheduled or handed to a person, never left stuck (agent)
- [ ] A new sequence uses the lead's own time zone (agent)
- [ ] Staff profiles (names, phone numbers) are visible only to people in the same company (agent)
- [ ] Every screen and API route checks the user's role (admin, operator, viewer) through one shared check, proven by a test (agent)
- [ ] Every API route requires sign-in unless it is on a short public list, and expired or forged sign-in tokens are proven rejected (agent)
- [ ] `bun run demo --keep` leaves its demo company in place so the result can be looked at in the console (agent)

## Slice 2: First real WhatsApp message
Status: not started
Goal: A real lead gets a real WhatsApp message from the system, and their reply comes back in.
Proof: Devesh adds his own number as a contact in the console, presses "Start outreach", receives the WhatsApp message on his phone, replies, and sees both messages in the console transcript.
Blocked by: Meta WhatsApp Business test number, access token and one approved message template (Devesh); a public address for incoming messages (a temporary tunnel is enough for the test)
Seen by Devesh: —

- [ ] Add a single contact (name, phone, WhatsApp opt-in) from the console (agent)
- [ ] Every contact has a WhatsApp destination: import and the console create a WhatsApp number, or sending falls back to the main phone number (today sending looks only for a WhatsApp number and import creates only a phone number) (agent)
- [ ] "Start outreach" button on a contact enrols them in a sequence (the first real use of startRun) (agent)
- [ ] A starter sequence whose first step sends the approved WhatsApp template (agent)
- [ ] Real WhatsApp sender behind the guardrails, switched on only when its keys are set; a template outside the 24-hour reply window, free text inside it (agent)
- [ ] Incoming WhatsApp webhook: signature checked, each reply matched to the right customer company by the number it was sent to (agent)
- [ ] Every WhatsApp message, sent and received, is stored on the lead's conversation and shown in the console transcript (agent)
- [ ] Opt-in recorded and checked before any WhatsApp send (agent)

## Slice 3: The sales agent decides the next step
Status: not started
Goal: For each lead, an AI decides what to do next, when, on which channel and why, inside the operator's rules, instead of a fixed script.
Proof: Devesh messages "call me after Diwali, my family decides Sunday evening". The console shows the next step as a call on Sunday 15 November 2026 in the evening (the first Sunday after Diwali on 8 November), with the reason in plain words. A short version ("message me in 10 minutes") actually arrives on his phone about 10 minutes later.
Blocked by: Slice 2; the Anthropic key (the AI model's password) set on the test server (Devesh)
Seen by Devesh: —

- [ ] Sequences become a goal plus rules (allowed actions, how often, when to hand over to a person) (agent)
- [ ] Agent tools: read the lead's history, send WhatsApp, schedule the next touch, hand over to a person, save a memory (agent)
- [ ] The company's approval setting is read before every agent action; an action that needs approval becomes a task for a person, never a silent drop (agent)
- [ ] After every event (reply, call ended, timer), the agent picks one next action with time, channel and reason, and the rules check it before it is saved (agent)
- [ ] Test conversations the agent must pass, each checking it picks the right day and time: after Diwali, family decides Sunday, no answer twice, stop contacting me, budget mismatch, angry caller (agent)
- [ ] Decision history: every next step, its reason, and whether the agent or a person chose it (agent)
- [ ] Console: each lead's next step, reason and history; a person can move or cancel it (agent)

## Slice 4: First real phone call
Status: not started
Goal: The system places a real call; the voice agent knows the lead and can act during the call; the call's result drives the next step.
Proof: Devesh's phone rings, the agent greets him knowing why it is calling, and afterwards the console shows the transcript, summary, outcome and the agent's next step.
Blocked by: Slice 3; an Indian phone number or line from Exotel or Plivo that Vapi (the voice-AI service that places and talks on our calls) can call through (Devesh); the worker reachable from the internet (a temporary tunnel is enough for the test)
Seen by Devesh: —

- [ ] Real Vapi dialer behind the guardrails (agent)
- [ ] Voice agent set up from our own agent settings and pushed to Vapi automatically, never edited by hand there (agent)
- [ ] The lead's history and memory are given to the voice agent before it dials (agent)
- [ ] During the call the agent can book a visit or note a fact and gets the answer within the call (agent)
- [ ] When a call ends, its result is fed back so the sales agent decides that lead's next step (agent)
- [ ] Voice quality gate on real Indian mobile calls: reply delay p50 ≤ 800ms, p90 ≤ 1200ms, p99 ≤ 1800ms, measured from the call logs (targets: docs/tech-stack.md T10) (agent)
- [ ] Devesh takes five test calls and rates how natural the Hinglish sounds (Devesh)

## Slice 5: A console you can run a pilot from
Status: not started
Goal: An operator runs a campaign end to end without a developer.
Proof: Without developer help, Devesh creates a test company, invites a teammate, imports a CSV of 10 consenting test numbers, sets the goal and rules, watches the WhatsApp messages go out, and claims and completes a hand-over task. (Calls join the campaign once Slice 4 is done.)
Blocked by: Slice 3
Seen by Devesh: —

- [x] Sign in to the console with email and password and land on your first workspace (agent) · evidence: [#101](https://github.com/devesh911/revenue-os/pull/101), the browser sign-in test passed 6 of 6 against the real local stack in CI, plus screenshots of the login, first-workspace, no-workspace and no-access pages
- [ ] Create a company and invite the team (agent)
- [ ] Forgot-password email link that works from any device (agent)
- [ ] Sign in with a phone code or with Google (agent)
- [ ] Admins confirm sign-in with an authenticator-app code, and again before destructive admin actions (agent)
- [ ] Console security headers (content security policy, no framing), 12-character passwords and email confirmation (agent)
- [ ] CSV import screen that enrols the imported leads (agent)
- [ ] Set goal, rules and prompt; a new agent version goes live only after it passes the test conversations (agent)
- [ ] Task queue: claim, complete, dismiss (agent)
- [ ] Tag the outcome of a finished conversation (agent)

## Slice 6: Pilot go-live
Status: not started
Goal: One real customer's leads flow through the system safely for a week.
Proof: A pilot customer's new leads arrive and are worked for seven days, with a daily report of cost per qualified lead and outcomes against the agreed baseline.
Blocked by: Slices 4 and 5; the voice quality gate passed; pilot customer signed with the data clause (Devesh); domain bought and the worker permanently deployed (Devesh)
Seen by Devesh: —

- [ ] The pilot's new leads arrive by themselves from their source (for example Meta lead ads or a portal feed) and get their first message within five minutes (agent)
- [ ] Test and live deploy pipeline; a health check that really checks the database and the job queue (agent)
- [ ] Alerts for stuck sequences and failed sends (agent)
- [ ] Legal floor verified end to end: do-not-call, calling hours, consent, the recording-consent line (agent)
- [ ] Cost per lead recorded for every AI call, call minute and message (agent)
- [ ] Baseline conversion captured and one success metric agreed in writing (Devesh)
- [ ] Replace every password and key created during setup, then switch the repo to human-only merges (PHASE: LIVE) using docs/runbooks/go-live.md (Devesh)
