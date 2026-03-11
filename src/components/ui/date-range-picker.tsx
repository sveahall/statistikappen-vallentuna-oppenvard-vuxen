import * as React from "react";
import { Calendar } from "./calendar";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";
import { Button } from "./button";
import { sv } from "date-fns/locale";

const quickRanges = [
  { label: "Idag", get: () => {
    const today = new Date();
    return { from: today, to: today };
  }},
  { label: "Senaste 7 dagar", get: () => {
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    return { from, to: today };
  }},
  { label: "Denna månad", get: () => {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from, to: today };
  }},
  { label: "Förra månaden", get: () => {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const to = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from, to };
  }},
  { label: "I år", get: () => {
    const today = new Date();
    const from = new Date(today.getFullYear(), 0, 1);
    return { from, to: today };
  }},
];

export function DateRangePicker({ value, onChange }: {
  value: { from: Date|null, to: Date|null },
  onChange: (val: { from: Date|null, to: Date|null }) => void
}) {
  const [open, setOpen] = React.useState(false);
  const [range, setRange] = React.useState<{ from: Date|null, to: Date|null }>(value);

  React.useEffect(() => {
    setRange(value);
  }, [value]);

  function handleSelect(range: { from: Date|null, to: Date|null }) {
    setRange(range);
    onChange(range);
    setOpen(false);
  }

  function formatRange(r: { from: Date|null, to: Date|null }) {
    if (!r.from && !r.to) return "Välj datum";
    if (r.from && !r.to) return r.from.toLocaleDateString("sv-SE");
    if (r.from && r.to) {
      if (r.from.getTime() === r.to.getTime()) return r.from.toLocaleDateString("sv-SE");
      return `${r.from.toLocaleDateString("sv-SE")} – ${r.to.toLocaleDateString("sv-SE")}`;
    }
    return "Välj datum";
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-between min-w-[180px] px-4 text-left font-normal">
          {formatRange(range)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-4 w-auto min-w-[320px]">
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 mb-2 flex-wrap">
            {quickRanges.map(q => (
              <Button key={q.label} variant="ghost" size="sm" onClick={() => handleSelect(q.get())}>{q.label}</Button>
            ))}
          </div>
          <Calendar
            locale={sv}
            mode="range"
            selected={{
              from: range.from ?? undefined,
              to: range.to ?? undefined
            }}
            onSelect={(r) =>
              setRange({
                from: r?.from ?? null,
                to: r?.to ?? null,
              })
            }            
            numberOfMonths={2}
          />
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Avbryt</Button>
            <Button variant="default" size="sm" onClick={() => handleSelect(range)} disabled={!range.from || !range.to}>Tillämpa</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
} 