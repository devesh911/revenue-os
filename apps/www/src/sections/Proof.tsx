import { proof } from "../content/proof";
import { Card } from "../design/Card";
import { Heading } from "../design/Heading";
import { Section } from "../design/Section";
import { Text } from "../design/Text";
import { cx } from "../lib/cx";

// The proof under the hero: an EXAMPLE of the pilot report, set as a real <table>
// the visitor can inspect. The badge, the caption and the intro all say it is
// illustrative, so nothing reads as a customer result (the badge leads the caption,
// so a screen reader hears the qualifier first). Revenue OS values are ink,
// the current process ink-2 — emphasis by tone, no accent. Below sm each row
// re-flows into a two-column grid (the measure on its own line, both values under
// their column heads) so the report stays readable at 360px with no sideways scroll.
// The two value columns keep one fixed width from sm up, and each head is capped
// so it always breaks the same way — the process on one line, "(example)" under it
// — at every width, leaving the measures room to stay on one line (even at lg's
// narrowest card, 1024px).
const MEASURE = "sm:px-[20px]";
const NUMBER = "sm:pr-[20px] sm:pl-[12px]";
const HEAD = "py-[10px] align-bottom";
const HEAD_TEXT = "block max-w-[120px] text-balance";
const ROW =
  "max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-[16px] max-sm:px-[16px]";
const VALUE = cx(
  NUMBER,
  "font-mono text-[15px] tabular-nums max-sm:pb-[14px] sm:py-[15px]",
);

export function Proof() {
  const { columns } = proof;
  return (
    <Section
      tone="wash"
      aria-labelledby="proof-title"
      className="grid gap-[28px] lg:grid-cols-12 lg:gap-[32px]"
    >
      <div className="max-w-[560px] lg:col-span-5 lg:pt-[20px]">
        <Heading id="proof-title">{proof.title}</Heading>
        <Text tone="muted" className="mt-[12px]">
          {proof.intro}
        </Text>
      </div>

      <div className="lg:col-span-7">
        <Card tone="product">
          <table className="w-full border-collapse text-left max-sm:block">
            <caption className="px-[16px] pt-[20px] pb-[18px] text-left max-sm:block sm:px-[20px]">
              <span className="flex flex-col items-start gap-[10px] sm:flex-row-reverse sm:justify-between sm:gap-[16px]">
                <span className="inline-flex h-[24px] shrink-0 items-center rounded-full bg-ink/[0.06] px-[9px] font-medium text-[13px] text-ink">
                  {proof.badge}
                </span>
                <span>
                  <span className="block text-balance font-semibold text-[16px] text-ink leading-[1.4] tracking-[-0.01em]">
                    {proof.project}
                  </span>
                  <span className="mt-[2px] block text-[14px] text-ink-2">
                    {proof.period}
                  </span>
                </span>
              </span>
            </caption>
            <thead className="max-sm:block">
              <tr className={cx(ROW, "border-line border-y text-[13.5px]")}>
                <th
                  scope="col"
                  className={cx(
                    MEASURE,
                    HEAD,
                    "font-normal text-ink-2 max-sm:sr-only",
                  )}
                >
                  {columns.metric}
                </th>
                <th
                  scope="col"
                  className={cx(
                    NUMBER,
                    HEAD,
                    "font-normal text-ink-2 sm:w-[140px]",
                  )}
                >
                  <span className={HEAD_TEXT}>{columns.before}</span>
                </th>
                <th
                  scope="col"
                  className={cx(
                    NUMBER,
                    HEAD,
                    "font-medium text-ink sm:w-[140px]",
                  )}
                >
                  <span className={HEAD_TEXT}>{columns.after}</span>
                </th>
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {proof.rows.map((row) => (
                <tr
                  key={row.metric}
                  className={cx(ROW, "border-line border-b last:border-b-0")}
                >
                  <th
                    scope="row"
                    className={cx(
                      MEASURE,
                      "font-normal text-[15px] text-ink leading-[1.4] max-sm:col-span-2 max-sm:pt-[14px] max-sm:pb-[4px] sm:py-[15px]",
                    )}
                  >
                    {row.metric}
                  </th>
                  <td className={cx(VALUE, "text-ink-2")}>{row.before}</td>
                  <td className={cx(VALUE, "text-ink")}>{row.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Text size="small" tone="muted" className="mt-[14px]">
          {proof.footnote}
        </Text>
      </div>
    </Section>
  );
}
