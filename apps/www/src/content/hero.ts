// The hero's copy, the sample recording its listen button plays in place, the
// result card that sits on the drawing (one ready buyer's call, finished) and the
// drawing sheet under it. Hero, SampleAudio and SurveyGround compose these and
// inline none. The recording is SYNTHETIC (apps/www/scripts/make-sample-call.ts).
// Names, places and figures are illustrative. \u00a0 keeps a number with its unit.

const ILLUSTRATIVE = "Names and figures are illustrative.";

export const sampleCall = {
  src: "/sample-call.m4a",
  seconds: 42,
  disclosure: `Recreated with basic text-to-speech, not the voice used on real calls. ${ILLUSTRATIVE}`,
  play: "Play sample call", // after it has finished
  pause: "Pause sample call",
  resume: "Resume sample call",
  unavailable: "The recording didn't load.",
} as const;

export const hero = {
  eyebrow: "Voice AI for Indian real estate",
  title: "Turn property enquiries into qualified site visits.",
  sub: "Revenue OS calls new leads in Hinglish, qualifies budget and timeline, and follows up on WhatsApp\u2060—so your sales team can focus on buyers ready to visit.",
  secondary: "Hear a sample call",
} as const;

// The card on the drawing: what one call produced, not a live call. Leads arrive
// by import, so speed reads "called … after import"; no score is shown.
const lead = "Rohan Mehta";
const calledAfter = "2 min after import";
const bhk = "2\u00a0BHK";
const area = "Whitefield";
const timeline = "Within 12 months";

export const result = {
  lead,
  called: `Called ${calledAfter}`,
  captured: "Captured",
  fields: ["₹90\u00a0L", `${bhk} · ${area}`, timeline],
  outcome: "Site visit booked · Sat 11:00\u00a0AM",
  // the card as one image, in words a screen reader speaks well
  aria: `Illustrative result of one call: ${lead}'s enquiry, imported at 7:12\u00a0PM, was called in Hinglish ${calledAfter}. The call captured a budget of ₹90 lakh, a ${bhk} in ${area} and a timeline ${timeline.toLowerCase()}, and booked a site visit for Saturday at 11:00\u00a0AM.`,
} as const;

// The hero's ground (visuals/SurveyGround): a drawing sheet with the plan of the
// flat he asks about, lying under the card. The project, the flat and its width are
// illustrative, and the title strip says so.
export const survey = {
  title: "Meridian Greens · Tower B · Typical 2\u00a0BHK",
  illustrative: "Illustrative",
  width: "9.75\u00a0m",
} as const;
