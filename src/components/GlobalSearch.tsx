import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, User, Clock, FileText, Users, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { searchAll } from "@/lib/api";
import toast from "react-hot-toast";
import { GlobalSearchResult } from "@/types/types";

interface GlobalSearchProps {
  onResultSelect?: (result: GlobalSearchResult) => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ onResultSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const latestSearchId = useRef(0);
  const [hint, setHint] = useState<string | null>(null);

  const executeSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setHint(trimmed.length === 0 ? null : 'Minst två tecken krävs för sökning');
      return;
    }
    setHint(null);
    setIsLoading(true);
    const searchId = ++latestSearchId.current;
    try {
      const searchResults = await searchAll(trimmed);
      if (searchId === latestSearchId.current) {
        setResults(searchResults);
      }
    } catch (error) {
    if (searchId === latestSearchId.current) {
      setResults([]);
      toast.error(error instanceof Error ? error.message : "Kunde inte söka just nu");
    }
    } finally {
      if (searchId === latestSearchId.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const timeoutId = window.setTimeout(() => {
      void executeSearch(searchQuery);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [searchQuery, executeSearch, isOpen]);

  const handleResultClick = (result: GlobalSearchResult) => {
    // Blockera åtkomst till skyddad kund för icke-behöriga
    if (result.type === 'customer') {
      const customerData = result.data as { is_protected?: boolean; can_view?: boolean } | undefined;
      if (customerData?.is_protected && customerData?.can_view === false) {
        toast.error('Åtkomst nekad till skyddad kund');
        return;
      }
    }
    if (onResultSelect) {
      onResultSelect(result);
    }
    setIsOpen(false);
    setSearchQuery("");
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'customer': return 'bg-blue-100 text-blue-800';
      case 'handler': return 'bg-green-100 text-green-800';
      case 'effort': return 'bg-purple-100 text-purple-800';
      case 'case': return 'bg-orange-100 text-orange-800';
      case 'shift': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'customer': return 'Kund';
      case 'handler': return 'Behandlare';
      case 'effort': return 'Insats';
      case 'case': return 'Insats';
      case 'shift': return 'Tid';
      default: return type;
    }
  };

  const getIconComponent = (iconName: string) => {
    switch (iconName) {
      case 'User': return <User className="w-4 h-4" />;
      case 'Users': return <Users className="w-4 h-4" />;
      case 'FileText': return <FileText className="w-4 h-4" />;
      case 'Clock': return <Clock className="w-4 h-4" />;
      case 'Calendar': return <Calendar className="w-4 h-4" />;
      default: return <Search className="w-4 h-4" />;
    }
  };

  return (
    <div className="relative w-full max-w-full sm:w-72 md:w-80" ref={searchRef}>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <Input
          className="w-full pl-11 pr-10 py-2 h-11 rounded-full border border-gray-300 text-base placeholder:text-[#888888] focus:border-[var(--tenant-brand)] focus:ring-0"
          placeholder="Sök allt..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
            onClick={() => {
              setSearchQuery("");
              setResults([]);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Sökresultat dropdown */}
      {isOpen && (searchQuery || results.length > 0 || hint) && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          {hint && !isLoading ? (
            <div className="p-4 text-center text-gray-500">{hint}</div>
          ) : isLoading ? (
            <div className="p-4 text-center text-gray-500">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--tenant-brand)] mx-auto mb-2"></div>
              Söker...
            </div>
          ) : results.length > 0 ? (
            <div className="py-2">
              {results.map((result) => (
                <div
                  key={`${result.type}-${result.id}`}
                  className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                  onClick={() => handleResultClick(result)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1 text-gray-500">
                      {getIconComponent(result.icon)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900 truncate">
                          {result.title}
                        </span>
                        <Badge className={`text-xs ${getTypeBadgeColor(result.type)}`}>
                          {getTypeLabel(result.type)}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 truncate">
                        {result.subtitle}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : searchQuery && !isLoading ? (
          <div className="p-4 text-center text-gray-500">
              Inga resultat hittades för “{searchQuery}”
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
