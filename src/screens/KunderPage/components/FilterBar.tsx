// React import removed - not needed with modern React
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchIcon, FilterIcon } from "lucide-react";

interface FilterBarProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedFilter: string;
  setSelectedFilter: (filter: string) => void;
}

export const FilterBar = ({ 
  searchTerm, 
  setSearchTerm, 
  selectedFilter, 
  setSelectedFilter 
}: FilterBarProps): JSX.Element => {
  const filters = [
    { id: "alla", label: "Alla kunder" },
    { id: "aktiva", label: "Aktiva" },
    { id: "inaktiva", label: "Inaktiva" },
    { id: "nya", label: "Nya denna månad" },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <FilterIcon className="w-5 h-5 text-[#666666]" />
          <span className="text-lg font-semibold text-[#333333]">Filter</span>
        </div>
        
        <div className="relative">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-80 pl-4 pr-12 py-2 h-10 rounded-lg border border-gray-300 text-sm placeholder:text-[#888888] focus:border-[var(--tenant-brand)] focus:ring-0"
            placeholder="Sök efter namn, personnummer eller ID..."
          />
          <SearchIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
        </div>
      </div>

      <div className="flex gap-3">
        {filters.map((filter) => (
          <Button
            key={filter.id}
            variant={selectedFilter === filter.id ? "default" : "outline"}
            onClick={() => setSelectedFilter(filter.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedFilter === filter.id
                ? "bg-[var(--tenant-brand)] text-white hover:bg-[var(--tenant-brand-hover)]"
                : "bg-white text-[#666666] border-gray-300 hover:bg-gray-50"
            }`}
          >
            {filter.label}
          </Button>
        ))}
      </div>
    </div>
  );
};
