import { cx } from "../lib/cx";

// A wrapping run of short items separated by centred dots, where no line ever
// starts or ends on a dot: each item carries its own leading dot in a gap-wide
// ::before, pulled back into the gap by a negative margin, and the list clips the
// one that falls at each line start. The dot has empty alt text, so screen readers
// hear only the items.
export function DotList({
  items,
  className,
}: {
  items: readonly string[];
  className?: string;
}) {
  return (
    <ul
      className={cx("flex flex-wrap gap-x-[24px] overflow-hidden", className)}
    >
      {items.map((item) => (
        <li
          key={item}
          className="-ml-[24px] whitespace-nowrap before:inline-block before:w-[24px] before:text-center before:content-['·'_/_'']"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
