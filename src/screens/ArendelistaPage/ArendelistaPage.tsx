import { useCallback, useEffect, useRef, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUp, ArrowDown } from "lucide-react";
import { getCases } from "@/lib/api";
import { CaseWithNames } from "@/types/types";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { useRefresh } from "@/contexts/RefreshContext";
import { Button } from "@/components/ui/button";

export const ArendelistaPage = (): JSX.Element => {
  const navigate = useNavigate();
  const PAGE_SIZE = 200;
  const [cases, setCases] = useState<CaseWithNames[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<keyof CaseWithNames>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadError, setLoadError] = useState<null | { mode: 'initial' | 'append'; message: string }>(null);
  const { refreshKey } = useRefresh();
  const offsetRef = useRef(0);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    append ? setIsLoadingMore(true) : setIsLoading(true);
    setLoadError(null);
    try {
      const data = await getCases(includeInactive, {
        request: { signal: controller.signal },
        params: { limit: PAGE_SIZE, offset },
      });
      setCases(prev => (append ? [...prev, ...data] : data));
      offsetRef.current = offset + data.length;
      setHasMore(data.length === PAGE_SIZE);
    } catch (error) {
      const err = error as Error & { name?: string };
      if (err.name !== 'AbortError') {
        toast.error("Kunde inte hämta insatsen");
        setLoadError({ mode: append ? 'append' : 'initial', message: 'Kunde inte hämta insatsen. Försök igen.' });
      }
    } finally {
      append ? setIsLoadingMore(false) : setIsLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    setCases([]);
    setHasMore(true);
    offsetRef.current = 0;
    void fetchPage(0, false);
  }, [fetchPage, refreshKey]);

  const statusOptions = ["Aktivt", "inaktiv"];

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filtered = cases.filter(c => {
    const term = debouncedSearch.toLowerCase();
    const matchesSearch =
      !term || 
      (c.customer_name || "").toLowerCase().includes(term) || 
      (c.effort_name || "").toLowerCase().includes(term);
    const matchesStatus = statusFilter === "all" || (c.active ? "Aktivt" : "inaktiv") === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getSortValue = (obj: CaseWithNames, field: keyof CaseWithNames) => {
    const raw = obj[field];
    if (typeof raw === "number") return raw;
    if (typeof raw === "boolean") return raw ? 1 : 0;
    return String(raw ?? "").toLowerCase();
  };

  const sorted = [...filtered].sort((a, b) => {
    const av = getSortValue(a, sortField);
    const bv = getSortValue(b, sortField);
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ? 1 : -1;
    return 0;
  });

  // Navigera till kundens profil med insats markerat
  const handleCaseClick = (caseItem: CaseWithNames) => {
    navigate(`/kunder/${caseItem.customer_id}?caseId=${caseItem.id}`);
  };

  return (
    <Layout title="Insatslista">
      <div className="w-full flex flex-col gap-6 lg:gap-8 py-4 min-w-0">

      <Card className="flex-1 bg-white rounded-xl">
        <CardContent className="p-4 mobile:p-6">
          <div className="flex flex-col mobile:flex-row gap-4 mb-4 items-start mobile:items-center" data-tour="cases-filter">
            <Input
              placeholder="Sök kund eller insats"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full mobile:max-w-xs h-10"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full mobile:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                {statusOptions.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm" data-tour="cases-include-inactive">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              Inkludera inaktiva
            </label>
          </div>
          <div className="tablet:overflow-x-auto overflow-visible">
            <table className="responsive-table text-left tablet:min-w-[720px]" data-tour="cases-table">
              <thead>
                <tr className="border-b">
                  {[
                    { label: "Kund", field: "customer_name" },
                    { label: "Insats", field: "effort_name" },
                    { label: "Startdatum", field: "created_at" },
                    { label: "Status", field: "active" },
                    { label: "Behandlare 1", field: "handler1_name" },
                    { label: "Behandlare 2", field: "handler2_name" }
                  ].map(col => (
                    <th
                      key={col.field}
                      className="py-2 mobile:py-3 px-2 mobile:px-4 cursor-pointer text-xs mobile:text-sm"
                      onClick={() => {
                        const f = col.field as keyof CaseWithNames;
                        if (sortField === f) setSortAsc(a => !a);
                        else {
                          setSortField(f);
                          setSortAsc(true);
                        }
                      }}
                    >
                      <div className="flex items-center gap-1">
                        {col.label}
                        {sortField === col.field && (
                          sortAsc ? <ArrowUp size={14} className="mobile:w-4 mobile:h-4" /> : <ArrowDown size={14} className="mobile:w-4 mobile:h-4" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(c => (
                  <tr 
                    key={c.id} 
                    className="border-t hover:bg-gray-50 cursor-pointer transition-colors group"
                    onClick={() => handleCaseClick(c)}
                  >
                    <td data-label="Kund" className="py-2 mobile:py-3 px-2 mobile:px-4 group-hover:text-[var(--tenant-brand)] group-hover:font-medium text-xs mobile:text-sm">{(c.customer_active === false || c.customer_name === 'ANONYM') ? '—' : c.customer_name}</td>
                    <td data-label="Insats" className="py-2 mobile:py-3 px-2 mobile:px-4 group-hover:text-[var(--tenant-brand)] text-xs mobile:text-sm">{c.effort_name}</td>
                    <td data-label="Startdatum" className="py-2 mobile:py-3 px-2 mobile:px-4 text-xs mobile:text-sm">
                      {new Date(c.created_at).toLocaleDateString('sv-SE')}
                    </td>
                    <td data-label="Status" className="py-2 mobile:py-3 px-2 mobile:px-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        c.active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {c.active ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </td>
                    <td data-label="Behandlare 1" className="py-2 mobile:py-3 px-2 mobile:px-4 group-hover:text-[var(--tenant-brand)] text-xs mobile:text-sm">{c.handler1_name}</td>
                    <td data-label="Behandlare 2" className="py-2 mobile:py-3 px-2 mobile:px-4 group-hover:text-[var(--tenant-brand)] text-xs mobile:text-sm">{c.handler2_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasMore && (
              <div className="flex justify-center py-4">
                <Button
                  variant="outline"
                  onClick={() => fetchPage(offsetRef.current, true)}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? "Laddar..." : "Ladda fler"}
                </Button>
              </div>
            )}
            {loadError && (
              <div className="flex flex-col items-center gap-2 py-4 text-sm text-red-600">
                <span>{loadError.message}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchPage(loadError.mode === 'append' ? offsetRef.current : 0, loadError.mode === 'append')}
                >
                  Försök igen
                </Button>
              </div>
            )}
            {isLoading && cases.length === 0 && (
              <div className="py-6 text-center text-sm text-gray-500">Laddar insatser...</div>
            )}
          </div>
        </CardContent>
      </Card>

      </div>
    </Layout>
  );
};
