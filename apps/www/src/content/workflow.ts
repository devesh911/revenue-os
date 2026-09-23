// "How it works" — three steps, each with a small product example, and the
// follow-up branch beneath them. The follow-up schedule is an example: the cadence
// is set per project. `as const` keeps each step's example typed on its own shape.
// The call status, delay and "after" read as one phrase ("Called 2 min after
// import"); they are kept apart so the delay can change alone. \u2011 is a
// non-breaking hyphen, so "follow-ups" and "re-call" never split across lines.

export const workflow = {
  title: "From enquiry to site visit",
  intro: "Every new enquiry goes through the same three steps.",
  steps: [
    {
      title: "Respond quickly",
      body: "Call a new enquiry.",
      example: {
        label: "Enquiry imported",
        time: "11:42 AM",
        line: "Rohan Mehta · from your enquiry list",
        status: "Called",
        delay: "2 min",
        after: "after import",
      },
    },
    {
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
    title: "Not ready to visit yet?",
    body: "Buyers who are still exploring get WhatsApp follow\u2011ups and a scheduled re\u2011call, so they keep hearing from you on a schedule you set.",
    label: "Example follow-up plan",
    plan: [
      { when: "Today", what: "Floor plans and price sheet on WhatsApp" },
      { when: "Day 7", what: "WhatsApp check-in" },
      { when: "Day 30", what: "A re\u2011call to see if plans have changed" },
    ],
  },
} as const;
