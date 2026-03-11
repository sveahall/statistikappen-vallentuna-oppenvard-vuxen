import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { CaseWithNames } from "@/types/types";

interface CaseComboboxProps {
  cases: CaseWithNames[];
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

function formatLabel(caseItem: CaseWithNames): string {
  const customer = caseItem.customer_active === false || caseItem.customer_name === 'ANONYM'
    ? '—'
    : caseItem.customer_name || 'Okänd kund';
  return `${customer} – ${caseItem.effort_name ?? 'Okänd insats'}`;
}

function formatMeta(caseItem: CaseWithNames): string | null {
  const handler1 = caseItem.handler1_name;
  const handler2 = caseItem.handler2_name;
  if (handler1 && handler2) return `${handler1} & ${handler2}`;
  if (handler1) return handler1;
  if (handler2) return handler2;
  return null;
}

export const CaseCombobox = ({ cases, value, onChange, placeholder, disabled }: CaseComboboxProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedCase = value != null ? cases.find(c => c.id === value) : undefined;

  useEffect(() => {
    if (value == null) {
      const frame = requestAnimationFrame(() => setSearch(""));
      return () => cancelAnimationFrame(frame);
    }
    if (!cases.some(c => c.id === value)) {
      onChange(null);
    }
  }, [cases, value, onChange]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const options = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return cases;
    }
    return cases.filter(caseItem => {
      const parts = [
        caseItem.customer_name,
        caseItem.effort_name,
        caseItem.handler1_name,
        caseItem.handler2_name,
        caseItem.id?.toString(),
      ];
      return parts.some(part => (part ?? '').toLowerCase().includes(term));
    });
  }, [cases, search]);

  const inputValue = open
    ? search
    : selectedCase
      ? formatLabel(selectedCase)
      : "";

  const handleFocus = () => {
    if (disabled) return;
    setOpen(true);
    setSearch(selectedCase ? formatLabel(selectedCase) : "");
    requestAnimationFrame(() => {
      inputRef.current?.select?.();
    });
  };

  const handleSelect = (caseItem: CaseWithNames) => {
    onChange(caseItem.id);
    setSearch("");
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={event => {
          setSearch(event.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={handleFocus}
        placeholder={placeholder || "Välj insats"}
        className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 pr-8 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
        autoComplete="off"
        disabled={disabled}
      />
      {selectedCase && !disabled && (
        <button
          type="button"
          className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600"
          onClick={() => {
            onChange(null);
            setSearch("");
            setOpen(false);
          }}
          aria-label="Rensa vald insats"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {open && !disabled && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-gray-400">Inga träffar</div>
          ) : (
            options.map(option => {
              const isSelected = option.id === value;
              const label = formatLabel(option);
              const meta = formatMeta(option);
              return (
                <button
                  type="button"
                  key={option.id}
                  onMouseDown={event => {
                    event.preventDefault();
                    handleSelect(option);
                  }}
                  className={`w-full px-3 py-2 text-left hover:bg-[var(--tenant-brand-soft)] ${isSelected ? 'bg-green-50' : ''}`}
                >
                  <div className="font-medium text-gray-900">{label}</div>
                  {meta && <div className="text-xs text-gray-500">{meta}</div>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
