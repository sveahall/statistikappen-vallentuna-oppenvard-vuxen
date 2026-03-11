import { useEffect, useState, useRef } from "react";
import { getEfforts } from "@/lib/api";
import { useRefresh } from "@/contexts/RefreshContext";
import type { Effort } from "@/types/types";

type EffortOption = {
  id: string;
  name: string;
};

interface InsatsComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const InsatsCombobox = ({ value, onChange, placeholder }: InsatsComboboxProps) => {
  const [insatser, setInsatser] = useState<EffortOption[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { refreshKey } = useRefresh();

  useEffect(() => {
    async function fetchEfforts() {
      try {
        const data = await getEfforts();
        setInsatser(data.map((effort: Effort) => ({ id: effort.id.toString(), name: effort.name })));
      } catch (err) {
        setInsatser([]);
      }
    }
    fetchEfforts();
  }, [refreshKey]);

  // Hantera klick utanför
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const filteredInsatser = search === ""
    ? insatser
    : insatser.filter((insats) => insats.name.toLowerCase().includes(search.toLowerCase()));

  const selected = insatser.find(i => i.id === value);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        className="w-full p-2 border border-gray-300 rounded focus:border-[var(--tenant-brand)] focus:ring-0 text-[#333333]"
        value={selected ? selected.name : search}
        onFocus={() => setOpen(true)}
        onChange={e => {
          setSearch(e.target.value);
          setOpen(true);
          onChange("");
        }}
        placeholder={placeholder || "Välj insats..."}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-32 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm border border-gray-200">
          {filteredInsatser.length === 0 && search !== "" ? (
            <div className="p-2 text-gray-400 cursor-default">Ingen träff</div>
          ) : (
            filteredInsatser.map((insats) => (
              <div
                key={insats.id}
                className={`p-2 cursor-pointer hover:bg-[var(--tenant-brand-soft)] ${insats.id === value ? "bg-green-50" : ""}`}
                onMouseDown={() => {
                  onChange(insats.id);
                  setSearch("");
                  setOpen(false);
                }}
              >
                {insats.name}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}; 
