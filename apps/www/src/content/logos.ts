// Logo wall — the wordmarks in the trust row and its caption. Copy lives here so
// Logos.tsx composes but never inlines a brand name (architecture separation pin).

export const logosCaption = "TRUSTED BY TEAMS SELLING 12,000+ UNITS / YR";

export const logos = [
  "MERIDIAN",
  "VASTU ONE",
  "GRIHA CO.",
  "NORTHGATE",
  "ANVAYA",
] as const;

export type Logo = (typeof logos)[number];
