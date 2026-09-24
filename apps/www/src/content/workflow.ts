// Chapter 03 of How it works — the call and after: three steps, each with a small
// product example, and the follow-up branch beneath them. The follow-up schedule is
// an example: the cadence is set per project. `as const` keeps each step's example
// typed on its own shape. The call status, delay and "after" read as one phrase
// ("Called 2 min after import"); they are kept apart so the delay can change alone.
// ‑ is a non-breaking hyphen, so "follow-ups" and "re-call" never split across lines.
// StageGrid, FunnelFlow and IntentRouting compose it and inline none of it.
//
// The engine panel's small slots — each step's tag, the flow diagram's labels and
// the follow-up route's tag — carry words taken from the copy around them ("new
// enquiry", "follow-ups", "site visit", "still exploring"), never a new claim. The
// ↻ glyph is shared by the diagram's loop and the follow-up route.

const loopArrow = "↻";

export const workflow = {
  step: "03", // chapter 03 of How it works (content/beforeCall.ts holds 01 and 02)
  kicker: "The call and after",
  title: "The call, then the next step",
  intro: "Every enquiry that gets a call goes through the same three steps.",
  flow: {
    entry: "New enquiries",
    loop: "Follow-up",
    loopArrow,
    exit: "Site visit",
  },
  steps: [
    {
      num: "01",
      tag: "First call",
      title: "Respond quickly",
      body: "Call a new enquiry.",
      example: {
        label: "Enquiry imported",
        time: "7:12 PM",
        line: "Rohan Mehta · from your enquiry list",
        status: "Called",
        delay: "2 min",
        after: "after import",
      },
    },
    {
      num: "02",
      tag: "Qualify",
      title: "Understand the buyer",
      body: "Capture budget, location, and timeline.",
      example: {
        fields: [
          { label: "Budget", value: "₹90 L" },
          { label: "Location", value: "Whitefield" },
          { label: "Timeline", value: "Within 12 months" },
        ],
      },
    },
    {
      num: "03",
      tag: "Visit or follow-up",
      title: "Arrange the next step",
      body: "Book a visit or continue following up.",
      example: {
        label: "Site visit booked",
        when: "Sat, 11:00 AM",
        where: "Tower B, Meridian Greens",
      },
    },
  ],
  followUp: {
    arrow: loopArrow,
    tag: "Still exploring",
    title: "Not ready to visit yet?",
    body: "Buyers who are still exploring get WhatsApp follow‑ups and a scheduled re‑call, so they keep hearing from you on a schedule you set.",
    label: "Example follow-up plan",
    plan: [
      { when: "Today", what: "Floor plans and price sheet on WhatsApp" },
      { when: "Day 7", what: "WhatsApp check-in" },
      { when: "Day 30", what: "A re‑call to see if plans have changed" },
    ],
  },
} as const;
