// "What the buyer hears, and what your team gets" — Rohan's call up close: three demonstrations, each a
// small product example and one short explanation. All names, places and times are
// illustrative. In the summary, the last field is the outcome (the next step).
// \u00a0 keeps a number with its unit (1,050 sq ft, 11:00 AM, Tower B) on one line.
// `kicker`, `intro` and each `plate` are derived slot fills for the section's design:
// the nav label, a lede built from the three titles plus the illustrative note, and
// the words drawn on each card's illustration (MoatArt) — phrases lifted from the
// conversation, the summary's own field labels, the visit's three moments.

export const examples = {
  kicker: "Examples",
  title: "What the buyer hears, and what your team gets",
  intro:
    "Rohan's call, up close: the conversation in Hinglish, the summary your salesperson receives, and the WhatsApp confirmation that follows. Names, places and times are illustrative.",
  badge: "Example",
  conversation: {
    title: "A natural Hinglish conversation",
    body: "Buyers switch between Hindi and English mid-sentence. The agent follows them, in the language they are using.",
    header: "Call transcript",
    lines: [
      {
        who: "Buyer",
        text: "Carpet area kitna hai? Aur parking included hai?",
      },
      {
        who: "Agent",
        text: "2 BHK ka carpet area 1,050\u00a0sq\u00a0ft hai, aur ek covered parking included hai.",
      },
      { who: "Buyer", text: "Okay. Weekend pe dekh sakte hain?" },
    ],
    plate: {
      phrases: ["Kitna hai?", "Included hai", "Weekend pe?"],
      stamp: "Hinglish",
    },
  },
  summary: {
    title: "A summary your salesperson can use",
    body: "After the call, your team gets the facts they need before they pick up the phone.",
    lead: "Rohan Mehta",
    state: "Qualified",
    fields: [
      { label: "Looking for", value: "2 BHK, Whitefield" },
      { label: "Budget", value: "₹90 L" },
      { label: "Timeline", value: "Within 12 months" },
      { label: "Financing", value: "Home loan needed" },
      { label: "Asked about", value: "Possession date, loan partners" },
      { label: "Next step", value: "Site visit, Sat 11:00\u00a0AM" },
    ],
    plate: ["Budget", "Timeline", "Next step"],
  },
  visit: {
    title: "Site-visit confirmation and reminder",
    body: "The buyer gets the time, the address and a reminder on WhatsApp, without anyone on your team typing it.",
    contact: "Rohan Mehta",
    channel: "WhatsApp",
    messages: [
      {
        time: "Thu 7:16\u00a0PM",
        text: "Hi Rohan, your site visit to Meridian Greens, Tower\u00a0B is confirmed for Saturday at 11:00\u00a0AM. We'll share the location pin before the visit.",
      },
      {
        time: "Fri 6:00\u00a0PM",
        text: "Reminder: your visit is tomorrow at 11:00\u00a0AM. Here is the location pin for Tower\u00a0B.",
      },
    ],
    plate: ["Confirmed", "Reminder", "Site visit"],
  },
} as const;
