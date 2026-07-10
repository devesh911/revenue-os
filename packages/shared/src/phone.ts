// E.164 normalization — convention: phones normalize BEFORE insert; India-first defaults (D29).
// Deliberately conservative: unknown shapes return null and the caller reports them, never guesses.
// G1: runtime-agnostic.

export function normalizePhoneE164(
  raw: string,
  defaultCountry: "IN" = "IN",
): string | null {
  const digitsPlus = raw.trim().replace(/[\s\-().]/g, "");
  if (digitsPlus === "") return null;

  if (digitsPlus.startsWith("+")) {
    const digits = digitsPlus.slice(1);
    if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
    return `+${digits}`;
  }

  if (!/^\d+$/.test(digitsPlus)) return null;

  if (defaultCountry === "IN") {
    // bare 10-digit mobile (6-9 leading), 0-prefixed, or 91-prefixed
    if (/^[6-9]\d{9}$/.test(digitsPlus)) return `+91${digitsPlus}`;
    if (/^0[6-9]\d{9}$/.test(digitsPlus)) return `+91${digitsPlus.slice(1)}`;
    if (/^91[6-9]\d{9}$/.test(digitsPlus)) return `+${digitsPlus}`;
  }
  return null;
}
