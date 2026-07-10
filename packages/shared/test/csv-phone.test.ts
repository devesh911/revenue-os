// Task 9 RED — vendored CSV parser (T24: tiny utilities live in shared, not installed)
// and E.164 normalization (convention: normalized BEFORE insert, India default).
import { describe, expect, it } from "bun:test";
import { normalizePhoneE164, parseCsv } from "../src";

describe("normalizePhoneE164 (IN default)", () => {
  it("normalizes the common Indian formats", () => {
    expect(normalizePhoneE164("+91 98765 43210")).toBe("+919876543210");
    expect(normalizePhoneE164("098765 43210")).toBe("+919876543210");
    expect(normalizePhoneE164("98765-43210")).toBe("+919876543210");
    expect(normalizePhoneE164("+91-98765-43210")).toBe("+919876543210");
    expect(normalizePhoneE164("919876543210")).toBe("+919876543210");
  });

  it("keeps valid foreign E.164 untouched", () => {
    expect(normalizePhoneE164("+14155552671")).toBe("+14155552671");
  });

  it("rejects garbage", () => {
    expect(normalizePhoneE164("hello")).toBeNull();
    expect(normalizePhoneE164("12345")).toBeNull();
    expect(normalizePhoneE164("")).toBeNull();
  });
});

describe("parseCsv", () => {
  it("parses headers, quoted fields, embedded commas and CRLF", () => {
    const rows = parseCsv(
      'name,phone,city\r\n"Shah, Ceramics",9876543210,Morbi\r\nMehta,9876543211,Ahmedabad\r\n',
    );
    expect(rows).toEqual([
      { name: "Shah, Ceramics", phone: "9876543210", city: "Morbi" },
      { name: "Mehta", phone: "9876543211", city: "Ahmedabad" },
    ]);
  });

  it("handles escaped quotes and blank lines", () => {
    const rows = parseCsv('a,b\n"say ""hi""",2\n\n');
    expect(rows).toEqual([{ a: 'say "hi"', b: "2" }]);
  });
});
