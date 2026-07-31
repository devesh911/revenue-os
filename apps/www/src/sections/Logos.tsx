import { logos, logosCaption } from "../content/logos";
import { MonoLabel } from "../design/MonoLabel";
import { SectionFrame } from "../design/SectionFrame";

// The trust row: a caption cell + a five-up wall of client wordmarks. Collapses to a
// stacked caption + two-up wall on small screens (the export's `.ro-logos` grid).
export function Logos() {
  return (
    <SectionFrame className="grid grid-cols-[auto_1fr] items-stretch max-[980px]:grid-cols-1">
      <div className="flex max-w-[240px] items-center border-r border-hairline-18 px-[30px] py-[26px] max-[980px]:max-w-none max-[980px]:border-r-0 max-[980px]:border-b max-[980px]:border-hairline-18">
        <MonoLabel className="text-[11.5px] leading-[1.8] tracking-[0.26em] text-cream-55">
          {logosCaption}
        </MonoLabel>
      </div>
      <div className="grid grid-cols-5 max-[680px]:grid-cols-2">
        {logos.map((logo) => (
          <MonoLabel
            key={logo}
            className="flex items-center justify-center border-r border-hairline-09 px-[10px] py-[30px] text-[12px] tracking-[0.3em] text-cream-35 max-[680px]:border-b max-[680px]:border-hairline-09"
          >
            {logo}
          </MonoLabel>
        ))}
      </div>
    </SectionFrame>
  );
}
