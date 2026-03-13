import { useEffect, useState, useRef } from "react";
import { getCustomers } from "@/lib/api";
import { useRefresh } from "@/contexts/RefreshContext";
import type { Customer } from "@/types/types";
import { displayGender } from "@/lib/utils";

type CustomerOption = {
  id: string;
  label: string;
};

interface KundComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const KundCombobox = ({ value, onChange, placeholder }: KundComboboxProps) => {
  const [kunder, setKunder] = useState<CustomerOption[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { refreshKey } = useRefresh();

  useEffect(() => {
    async function fetchCustomers() {
      try {
        const data = await getCustomers();
        setKunder(
          data.map((k: Customer) => {
            const isGroup = k.is_group || k.isGroup;
            const genderPart = isGroup ? 'Grupp' : displayGender(k.gender);
            const birthValue = typeof k.birthYear !== 'undefined' ? k.birthYear : k.birth_year;
            const birthPart = isGroup || !birthValue ? '' : `(${birthValue})`;
            const label = [k.initials, genderPart, birthPart].filter(Boolean).join(' ').trim();
            return {
              id: k.id.toString(),
              label: label || k.initials,
            };
          })
        );
      } catch (err) {
        setKunder([]);
      }
    }
    fetchCustomers();
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

  const filteredKunder = search === ""
    ? kunder
    : kunder.filter((kund) => kund.label.toLowerCase().includes(search.toLowerCase()));

  const selected = kunder.find(k => k.id === value);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        className="w-full p-2 border border-gray-300 rounded focus:border-[var(--tenant-brand)] focus:ring-0 text-[#333333]"
        value={selected ? selected.label : search}
        onFocus={() => setOpen(true)}
        onChange={e => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        placeholder={placeholder || "Välj kund..."}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-32 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm border border-gray-200">
          {filteredKunder.length === 0 && search !== "" ? (
            <div className="p-2 text-gray-400 cursor-default">Ingen träff</div>
          ) : (
            filteredKunder.map((kund) => (
              <div
                key={kund.id}
                className={`p-2 cursor-pointer hover:bg-[var(--tenant-brand-soft)] ${kund.id === value ? "bg-green-50" : ""}`}
                onMouseDown={() => {
                  onChange(kund.id);
                  setSearch("");
                  setOpen(false);
                }}
              >
                {kund.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}; 
