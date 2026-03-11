import { useState, useEffect, useRef, useMemo, useCallback, ReactNode } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Layout } from "@/components/Layout";
import {
  getStatsSummary,
  getStatsByEffort,
  getEfforts,
  getHandlers,
  getPublicHandlers,
  getCustomers,
  getStatsRaw,
  getStatsByHandler,
  getStatsByGender,
  getStatsByBirthYear,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
// Tunga export-bibliotek laddas dynamiskt vid behov för att minska bundle-storlek
import { Customer, Handler, Effort } from "@/types/types";
import { api } from "@/lib/apiClient";
import toast from "react-hot-toast";
import { Loader2, ChevronDown } from "lucide-react";
import { useRefresh } from "@/contexts/RefreshContext";

const minBarHeight = 24;
const barChartHeight = 200;

const createNiceScale = (maxValue: number, maxTicks = 5) => {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return { ticks: [0, 1], niceMax: 1 };
  }

  const roughStep = maxValue / maxTicks;
  const exponent = Math.floor(Math.log10(roughStep));
  const magnitude = 10 ** exponent;
  const normalized = roughStep / magnitude;

  let niceNormalized: number;
  if (normalized <= 1) niceNormalized = 1;
  else if (normalized <= 2) niceNormalized = 2;
  else if (normalized <= 5) niceNormalized = 5;
  else niceNormalized = 10;

  const step = niceNormalized * magnitude;
  const niceMax = step * Math.ceil(maxValue / step);

  const ticks: number[] = [];
  for (let tick = 0; tick <= niceMax + step / 2; tick += step) {
    ticks.push(Number(tick.toFixed(10)));
  }

  return { ticks, niceMax };
};

const formatAxisTick = (value: number) => {
  const absValue = Math.abs(value);

  if (absValue >= 1_000_000) {
    const formatted = (value / 1_000_000).toLocaleString('sv-SE', { maximumFractionDigits: 1 });
    return `${formatted.replace('.', ',')}M`;
  }

  if (absValue >= 1_000) {
    const formatted = (value / 1_000).toLocaleString('sv-SE', { maximumFractionDigits: absValue >= 10_000 ? 0 : 1 });
    return `${formatted.replace('.', ',')}k`;
  }

  return value.toLocaleString('sv-SE', { maximumFractionDigits: 1 });
};

const createYAxisLabel = (primaryLabel: string, secondaryLabel: string, secondarySuffix?: string) => {
  if (primaryLabel === secondaryLabel) return primaryLabel;
  const suffix = secondarySuffix?.trim();
  const secondary = suffix ? `${secondaryLabel} (${suffix})` : secondaryLabel;
  return `${primaryLabel} & ${secondary}`;
};
const viewOptions = [
  { value: 'effort', label: 'Insatser' },
  { value: 'handler', label: 'Behandlare' },
  { value: 'gender', label: 'Kön' },
  { value: 'birthYear', label: 'Födelseår' },
] as const;

type StatsSeriesRow = {
  handler_name?: string;
  effort_name?: string;
  gender?: string;
  label?: string;
  antal_besok?: number | string;
  totala_timmar?: number | string;
  antal_kunder?: number | string;
};

type BirthYearStatsRow = StatsSeriesRow & { snitt_timmar?: number | string | null };
type ShiftStatusFilter = 'Alla' | 'Utförd' | 'Avbokad';
type AbortableError = { name?: string };
type ExportFilters = Record<string, string>;

const isAbortError = (error: unknown): error is AbortableError =>
  typeof error === 'object' && error !== null && 'name' in error && (error as AbortableError).name === 'AbortError';

type ViewMode = typeof viewOptions[number]['value'];

const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);

    if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', listener);
    else mediaQuery.addListener(listener);

    return () => {
      if (mediaQuery.removeEventListener) mediaQuery.removeEventListener('change', listener);
      else mediaQuery.removeListener(listener);
    };
  }, [query]);

  return matches;
};

const formatCategoryLabel = (value: string) => value
  .split(',')
  .map(token => {
    const trimmed = token.trim();
    const lower = trimmed.toLowerCase();
    if (lower === 'förebyggande') {
      return 'Förebyggande arbete';
    }
    return trimmed;
  })
  .join(', ');

export const StatistikPage = (): JSX.Element => {
  const { user } = useAuth();
  const { refreshKey } = useRefresh();
  const [tooltip, setTooltip] = useState<{ x: number; y: number; value: string } | null>(null);
  const [stats, setStats] = useState<{ antal_besok: number; antal_kunder: number; totala_timmar: number; avbokningsgrad: number } | null>(null);
  const [loading, setLoading] = useState(false);
  // Nytt: datumintervall
  const [dateRange, setDateRange] = useState<{ from: Date|null, to: Date|null }>({ from: null, to: null });

  // Stapeldiagram-data
  const [effortData, setEffortData] = useState<StatsSeriesRow[] | null>(null);
  const [handlerData, setHandlerData] = useState<StatsSeriesRow[] | null>(null);
  const [genderData, setGenderData] = useState<StatsSeriesRow[] | null>(null);
  const [birthYearData, setBirthYearData] = useState<StatsSeriesRow[] | null>(null);
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [selectedEfforts, setSelectedEfforts] = useState<string[]>([]);
  const [selectedEffortCategories, setSelectedEffortCategories] = useState<string[]>([]);
  const [selectedHandlers, setSelectedHandlers] = useState<string[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [includeInactive, setIncludeInactive] = useState<boolean>(false);
  const [shiftStatus, setShiftStatus] = useState<ShiftStatusFilter>('Alla');
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('effort');
  const chartRef = useRef<HTMLDivElement>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState<boolean>(false);
  const isTabletUp = useMediaQuery('(min-width: 640px)');

  useEffect(() => {
    // Öppna filterpanelen som standard på mobil för att göra fälten direkt tillgängliga
    setMobileFiltersOpen(!isTabletUp);
  }, [isTabletUp]);

  const chartSettings = useMemo(() => {
    const formatMeta = ({ customers, totalHours }: { customers?: number; totalHours?: number }) => {
      const parts: string[] = [];
      if (typeof customers === 'number' && Number.isFinite(customers)) {
        const count = customers;
        parts.push(`${count.toLocaleString('sv-SE')} ${count === 1 ? 'kund' : 'kunder'}`);
      }
      if (typeof totalHours === 'number' && !Number.isNaN(totalHours) && totalHours > 0) {
        parts.push(`${totalHours.toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} h`);
      }
      return parts.join(" • ");
    };

    let config: {
      title: string;
      primaryLabel: string;
      secondaryLabel: string;
      secondarySuffix?: string;
      showChart: boolean;
      data: Array<{ label: string; primaryValue: number; secondaryValue: number; meta?: string }>;
      xAxisLabel: string;
    };

    switch (viewMode) {
      case 'handler':
        config = {
          title: 'Besök och timmar per behandlare',
          primaryLabel: 'Besök',
          secondaryLabel: 'Timmar',
          secondarySuffix: ' h',
          showChart: true,
          xAxisLabel: 'Behandlare',
          data: (handlerData || []).map((d: StatsSeriesRow) => ({
            label: d.handler_name || 'Okänd',
            primaryValue: Number(d.antal_besok) || 0,
            secondaryValue: Number(d.totala_timmar) || 0,
            meta: formatMeta({ totalHours: Number(d.totala_timmar) || 0 }),
          })),
        };
        break;
      case 'gender':
        config = {
          title: 'Besök och timmar per kön',
          primaryLabel: 'Besök',
          secondaryLabel: 'Timmar',
          secondarySuffix: ' h',
          showChart: true,
          xAxisLabel: 'Kön',
          data: (genderData || []).map((d: StatsSeriesRow) => ({
            label: d.gender ?? 'Okänd',
            primaryValue: Number(d.antal_besok) || 0,
            secondaryValue: Number(d.totala_timmar) || 0,
            meta: formatMeta({ totalHours: Number(d.totala_timmar) || 0 }),
          })),
        };
        break;
      case 'birthYear':
        config = {
          title: 'Besök och kunder per födelseår',
          primaryLabel: 'Besök',
          secondaryLabel: 'Kunder',
          secondarySuffix: '',
          showChart: true,
          xAxisLabel: 'Födelseår',
          data: (birthYearData || []).map((d: StatsSeriesRow) => ({
            label: d.label ?? 'Okänt',
            primaryValue: Number(d.antal_besok) || 0,
            secondaryValue: Number(d.antal_kunder) || 0,
            meta: formatMeta({ customers: Number(d.antal_kunder) || 0, totalHours: Number(d.totala_timmar) || 0 }),
          })),
        };
        break;
      default:
        config = {
          title: 'Besök och timmar per insats',
          primaryLabel: 'Besök',
          secondaryLabel: 'Timmar',
          secondarySuffix: ' h',
          showChart: true,
          xAxisLabel: 'Insats',
          data: (effortData || []).map((d: StatsSeriesRow) => ({
            label: d.effort_name ?? 'Okänt',
            primaryValue: Number(d.antal_besok) || 0,
            secondaryValue: Number(d.totala_timmar) || 0,
            meta: formatMeta({ customers: Number(d.antal_kunder) || 0, totalHours: Number(d.totala_timmar) || 0 }),
          })),
        };
        break;
    }

    return {
      ...config,
      yAxisLabel: createYAxisLabel(config.primaryLabel, config.secondaryLabel, config.secondarySuffix),
    };
  }, [viewMode, effortData, handlerData, genderData, birthYearData]);

  const {
    data: chartData,
    title: chartTitle,
    primaryLabel: chartPrimaryLabel,
    secondaryLabel: chartSecondaryLabel,
    secondarySuffix: chartSecondarySuffix,
    showChart,
    xAxisLabel,
    yAxisLabel,
  } = chartSettings;
  const hasChartData = showChart && chartData.length > 0;

  const chartScale = useMemo<ReturnType<typeof createNiceScale>>(() => {
    if (!hasChartData) {
      return createNiceScale(1, 5);
    }

    const maxValue = Math.max(
      ...chartData.map(d => Math.max(Number(d.primaryValue) || 0, Number(d.secondaryValue) || 0)),
      1
    );

    const tickTarget = Math.min(6, Math.max(3, chartData.length >= 5 ? 6 : 5));
    return createNiceScale(maxValue, tickTarget);
  }, [chartData, hasChartData]);

  const formatHours = (value: number) => Number(value || 0).toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' h';

  const renderAggregatedTable = () => {
    let rows: StatsSeriesRow[] = [];
    let columns: { header: string; render: (row: StatsSeriesRow) => ReactNode; align?: 'left' | 'right' }[] = [];

    if (viewMode === 'handler') {
      rows = handlerData || [];
      columns = [
        { header: 'Behandlare', render: row => row.handler_name || 'Okänd' },
        { header: 'Besök', render: row => Number(row.antal_besok || 0).toLocaleString('sv-SE'), align: 'right' },
        { header: 'Totala timmar', render: row => formatHours(Number(row.totala_timmar || 0)), align: 'right' },
      ];
    } else if (viewMode === 'gender') {
      rows = genderData || [];
      columns = [
        { header: 'Kön', render: row => row.gender || 'Okänd' },
        { header: 'Besök', render: row => Number(row.antal_besok || 0).toLocaleString('sv-SE'), align: 'right' },
        { header: 'Totala timmar', render: row => formatHours(Number(row.totala_timmar || 0)), align: 'right' },
      ];
    } else if (viewMode === 'birthYear') {
      rows = birthYearData || [];
      columns = [
        { header: 'Födelseår', render: row => row.label ?? 'Okänt' },
        { header: 'Kunder', render: row => Number(row.antal_kunder || 0).toLocaleString('sv-SE'), align: 'right' },
        { header: 'Besök', render: row => Number(row.antal_besok || 0).toLocaleString('sv-SE'), align: 'right' },
        { header: 'Totala timmar', render: row => formatHours(Number(row.totala_timmar || 0)), align: 'right' },
      ];
    } else {
      rows = effortData || [];
      columns = [
        { header: 'Insats', render: row => row.effort_name || 'Okänd' },
        { header: 'Besök', render: row => Number(row.antal_besok || 0).toLocaleString('sv-SE'), align: 'right' },
        { header: 'Totala timmar', render: row => formatHours(Number(row.totala_timmar || 0)), align: 'right' },
        { header: 'Kunder', render: row => Number(row.antal_kunder || 0).toLocaleString('sv-SE'), align: 'right' },
      ];
    }

    if (!rows || rows.length === 0) {
      return (
        <div className="bg-white rounded-xl text-center text-gray-500 border border-gray-200">
          Ingen data att visa för valda filter.
        </div>
      );
    }

    const [primaryColumn, ...metricColumns] = columns;

    const mobileCards = !isTabletUp && primaryColumn ? (
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div
            key={`${viewMode}-mobile-${index}`}
            className="bg-white border border-gray-200 rounded-lg sm:rounded-xl shadow-sm p-3 sm:p-4"
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm sm:text-base font-semibold text-gray-900">
                  {primaryColumn.render(row)}
                </span>
              </div>
              {metricColumns.length > 0 && (
                <div className="grid grid-cols-2 gap-x-3 sm:gap-x-4 gap-y-2">
                  {metricColumns.map(col => (
                    <div key={col.header} className="flex flex-col gap-1">
                      <span className="text-[10px] sm:text-[11px] uppercase tracking-wide text-gray-500">
                        {col.header}
                      </span>
                      <span className={`text-xs sm:text-sm font-medium text-gray-900 ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                        {col.render(row)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    ) : null;

    const desktopTable = isTabletUp ? (
      <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="tablet:overflow-x-auto overflow-visible">
          <table className="responsive-table stats-responsive-table divide-y divide-gray-200 tablet:min-w-[720px]">
            <thead className="bg-gray-50">
              <tr>
                {columns.map(col => (
                  <th
                    key={col.header}
                    className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {rows.map((row, index) => (
                <tr key={`${viewMode}-desktop-${index}`} className="hover:bg-gray-50">
                  {columns.map(col => (
                    <td
                      key={col.header}
                      data-label={col.header}
                      className={`px-4 py-3 text-sm text-gray-700 ${col.align === 'right' ? 'text-right font-medium' : ''}`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ) : null;

    return mobileCards ?? desktopTable;
  };

  const renderFilterFields = () => (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-4 items-end min-w-0">
        <div className="gap-1 w-full flex flex-col min-w-0" data-tour="stats-filter-daterange">
          <label className="font-normal text-xs text-gray-500">Tidsperiod</label>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-normal text-xs text-gray-500">Kön</label>
          <MultiSelectCombobox
            options={[
              { label: "Flicka", value: "Flicka" },
              { label: "Pojke", value: "Pojke" },
              { label: "Icke-binär", value: "Icke-binär" },
            ]}
            value={selectedGenders}
            onChange={setSelectedGenders}
            placeholder="Alla kön"
          />
        </div>
        <div className="flex flex-col gap-1 w-full min-w-0">
          <label className="font-normal text-xs text-gray-500">Födelseår</label>
          <MultiSelectCombobox options={yearOptions} value={selectedYears} onChange={setSelectedYears} placeholder="Alla år" />
        </div>
        <div className="flex flex-col gap-1 w-full min-w-0">
          <label className="font-normal text-xs text-gray-500">Insats</label>
          <MultiSelectCombobox
            options={effortOptions.map(e => ({ label: e.name, value: String(e.id) }))}
            value={selectedEfforts}
            onChange={setSelectedEfforts}
            placeholder="Alla insatser"
          />
        </div>
        <div className="flex flex-col gap-1 w-full min-w-0">
          <label className="font-normal text-xs text-gray-500">Insatskategori</label>
          <MultiSelectCombobox
            options={[
              { label: "Behovsprövad", value: "Behovsprövad" },
              { label: "Förebyggande arbete", value: "Förebyggande arbete" },
              { label: "Behovsprövad, Förebyggande arbete", value: "Behovsprövad, Förebyggande arbete" },
              { label: "IUB", value: "IUB" },
              { label: "Behovsprövad, IUB", value: "Behovsprövad, IUB" }
            ]}
            value={selectedEffortCategories}
            onChange={setSelectedEffortCategories}
            placeholder="Alla kategorier"
          />
        </div>
        <div className="flex flex-col gap-1 w-full min-w-0">
          <label className="font-normal text-xs text-gray-500">Tidsstatus</label>
          <Select value={shiftStatus} onValueChange={(value) => setShiftStatus(value as ShiftStatusFilter)}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Alla" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Alla">Alla</SelectItem>
              <SelectItem value="Utförd">Utförd</SelectItem>
              <SelectItem value="Avbokad">Avbokad</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 w-full min-w-0">
          <label className="font-normal text-xs text-gray-500">Behandlare</label>
          <MultiSelectCombobox
            options={handlerOptions.map(h => ({ label: h.name, value: String(h.id) }))}
            value={selectedHandlers}
            onChange={setSelectedHandlers}
            placeholder="Alla behandlare"
          />
        </div>
        <div className="flex flex-col gap-1 w-full min-w-0">
          <label className="font-normal text-xs text-gray-500">Kund</label>
          <MultiSelectCombobox
            options={customerOptions.map(c => {
              const isGroup = c.is_group || c.isGroup;
              const label = isGroup ? `${c.initials} (Grupp)` : `${c.initials} (${c.birthYear ?? '—'})`;
              return { label, value: String(c.id) };
            })}
            value={selectedCustomers}
            onChange={setSelectedCustomers}
            placeholder="Alla kunder"
          />
        </div>
        <div className="flex items-end w-full h-10">
          <label className="flex items-center gap-2 text-sm px-3 py-2 border rounded-lg bg-white w-full justify-center md:justify-start">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Inkludera inaktiva
          </label>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 w-full">
        <Button
          variant="default"
          size="default"
          className="text-sm font-medium w-full sm:w-auto"
          onClick={() => loadStats()}
          data-tour="stats-update-btn"
          disabled={loading}
        >
          {loading ? (<span className="flex items-center justify-center gap-2"><Loader2 className="animate-spin" /> Uppdaterar...</span>) : 'Uppdatera'}
        </Button>
        <Button
          variant="outline"
          size="default"
          className="text-sm font-normal w-full sm:w-auto"
          onClick={() => {
            setDateRange({ from: null, to: null });
            setSelectedGenders([]);
            setSelectedYears([]);
            setSelectedEfforts([]);
            setSelectedEffortCategories([]);
            setSelectedHandlers([]);
            setSelectedCustomers([]);
            setIncludeInactive(false);
            setShiftStatus('Alla');
          }}
          data-tour="stats-reset-btn"
        >
          Rensa alla filter
        </Button>
      </div>
    </>
  );

  // Valbara alternativ
  type CustomerItem = Customer & { birthYear: number };

  const [effortOptions, setEffortOptions] = useState<Effort[]>([]);
  const [handlerOptions, setHandlerOptions] = useState<Handler[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CustomerItem[]>([]);
  const [yearOptions, setYearOptions] = useState<{ label: string; value: string }[]>([]);
  const yearLabel = (() => {
    if (dateRange.from && dateRange.to) {
      const fy = dateRange.from.getFullYear();
      const ty = dateRange.to.getFullYear();
      return fy === ty ? fy : `${fy}-${ty}`;
    }
    return new Date().getFullYear();
  })();

  // Hämta filteralternativ vid mount
  useEffect(() => {
    getEfforts().then(setEffortOptions).catch(() => toast.error("Kunde inte hämta insatser"));
    (user?.role === 'admin' ? getHandlers(true) : getPublicHandlers()).then((data) => setHandlerOptions(data as Handler[])).catch(() => toast.error("Kunde inte hämta behandlare"));
    getCustomers(true).then((data) => {
      // Konvertera Customer[] till CustomerItem[] genom att säkerställa att birthYear finns
      const customerItems: CustomerItem[] = data
        .filter((c): c is Customer & { birthYear: number } => typeof c.birthYear === "number")
        .map((c) => ({
          ...c,
          birthYear: c.birthYear,
        }));
      setCustomerOptions(customerItems);

      // Unika födelseår som string
      const years = Array.from(new Set(customerItems.map((c) => c.birthYear)))
        .filter(Boolean)
        .map(String)
        .sort((a, b) => Number(b) - Number(a));
      setYearOptions(years.map((y: string) => ({ label: y, value: y })));
    }).catch(() => toast.error("Kunde inte hämta kunder"));
  }, [user, refreshKey]);

  // Bygg query params från filter
  const buildParams = useCallback(() => {
    const params: Record<string, string | boolean> = {};
    if (dateRange.from) params.from = dateRange.from.toISOString().slice(0, 10);
    if (dateRange.to) params.to = dateRange.to.toISOString().slice(0, 10);
    if (selectedEfforts.length > 0) params.insats = selectedEfforts.join(",");
    if (selectedEffortCategories.length > 0) params.effortCategory = selectedEffortCategories.join(",");
    if (selectedGenders.length > 0) params.gender = selectedGenders.join(",");
    if (selectedYears.length > 0) params.birthYear = selectedYears.join(",");
    if (selectedHandlers.length > 0) params.handler = selectedHandlers.join(",");
    if (selectedCustomers.length > 0) params.customer = selectedCustomers.join(",");
    if (includeInactive) params.includeInactive = true;
    if (shiftStatus && shiftStatus !== 'Alla') params.shiftStatus = shiftStatus;
    
    return params;
  }, [
    dateRange,
    includeInactive,
    selectedCustomers,
    selectedEffortCategories,
    selectedEfforts,
    selectedGenders,
    selectedHandlers,
    selectedYears,
    shiftStatus,
  ]);

  const abortRef = useRef<AbortController | null>(null);

  const loadStats = useCallback(() => {
    setLoading(true);
    const params = buildParams();
    // Avbryt ev. pågående hämtningar
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    Promise.all([
      getStatsSummary(params, { signal: controller.signal }).catch(error => { if (!isAbortError(error)) toast.error("Kunde inte hämta statistik"); return null; }),
      getStatsByEffort(params, { signal: controller.signal }).catch(error => { if (!isAbortError(error)) toast.error("Kunde inte hämta diagramdata"); return null; }),
      getStatsByHandler(params, { signal: controller.signal }).catch(error => { if (!isAbortError(error)) toast.error("Kunde inte hämta statistik per behandlare"); return null; }),
      getStatsByGender(params, { signal: controller.signal }).catch(error => { if (!isAbortError(error)) toast.error("Kunde inte hämta statistik per kön"); return null; }),
      getStatsByBirthYear(params, { signal: controller.signal }).catch(error => { if (!isAbortError(error)) toast.error("Kunde inte hämta statistik per födelseår"); return null; })
    ]).then(([statsData, effortData, handlerDataRes, genderDataRes, birthYearDataRes]) => {
      if (!controller.signal.aborted) {
        setStats(statsData);
        setEffortData(effortData);
        setHandlerData(handlerDataRes);
        setGenderData(genderDataRes);
        setBirthYearData(birthYearDataRes);
      }
    }).finally(() => setLoading(false));
  }, [buildParams]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadStats();
    }, 300);
    return () => clearTimeout(t);
  }, [
    loadStats,
    refreshKey,
  ]);

  // Logga export
  const logExport = async (exportType: string, filters: ExportFilters) => {
    try {
      const payload = {
        action: 'EXPORT',
        entityType: 'data',
        entityName: exportType,
        details: { event: 'data_exported', export_type: exportType, filters }
      };
      await api('/audit/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error('Failed to log export:', error);
    }
  };

  // Exportfunktioner
  const handleExportPDF = async () => {
    try {
      const input = chartRef.current; // diagramkortet
      if (!input) return toast.error("Kunde inte hitta diagrammet för export");
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);
      const canvas = await html2canvas(input);
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape' });
      // Rubrik och datum
      pdf.setFontSize(18);
      pdf.text("Statistikrapport", 14, 18);
      pdf.setFontSize(10);
      pdf.text(`Exportdatum: ${new Date().toLocaleString("sv-SE")}`, 14, 26);
      // Filterinfo
      let y = 34;
      const filterInfo = [
        `Tidsperiod: ${dateRange.from && dateRange.to ? `${dateRange.from.toLocaleDateString()} - ${dateRange.to.toLocaleDateString()}` : "Alla"}`,
        `Kön: ${selectedGenders.length > 0 ? selectedGenders.join(", ") : "Alla"}`,
        `Födelseår: ${selectedYears.length > 0 ? selectedYears.join(", ") : "Alla"}`,
        `Insats: ${selectedEfforts.length > 0 ? effortOptions.filter(e => selectedEfforts.includes(String(e.id))).map(e => e.name).join(", ") : "Alla"}`,
        `Insatskategori: ${selectedEffortCategories.length > 0 ? selectedEffortCategories.map(formatCategoryLabel).join(", ") : "Alla"}`,
        `Behandlare: ${selectedHandlers.length > 0 ? handlerOptions.filter(h => selectedHandlers.includes(String(h.id))).map(h => h.name).join(", ") : "Alla"}`,
        `Kund: ${selectedCustomers.length > 0 ? customerOptions
          .filter(c => selectedCustomers.includes(String(c.id)))
          .map(c => (c.is_group || c.isGroup ? `${c.initials} (Grupp)` : `${c.initials} (${c.birthYear ?? '—'})`))
          .join(", ") : "Alla"}`
      ];
      filterInfo.forEach(row => {
        pdf.text(row, 14, y);
        y += 7;
      });
      // Diagram
      pdf.addImage(imgData, 'PNG', 14, y, 120, 60);
      y += 68;
      // Tabellhuvud
      pdf.setFontSize(12);
      pdf.text("Insats", 14, y);
      pdf.text("Antal besök", 64, y);
      pdf.text("Antal timmar", 114, y);
      pdf.text("Antal kunder", 164, y);
      y += 7;
      pdf.setFontSize(10);
      // Tabellrader
      (effortData || []).forEach(d => {
        pdf.text(String(d.effort_name), 14, y);
        pdf.text(String(d.antal_besok), 64, y);
        pdf.text(String(d.totala_timmar || 0), 114, y);
        pdf.text(String(d.antal_kunder), 164, y);
        y += 6;
      });
      // Summering
      const totalBesok = (effortData || []).reduce((sum, d) => sum + Number(d.antal_besok), 0);
      const totalTimmar = (effortData || []).reduce((sum, d) => sum + Number(d.totala_timmar || 0), 0);
      const totalKunder = (effortData || []).reduce((sum, d) => sum + Number(d.antal_kunder), 0);
      pdf.setFontSize(11);
      pdf.text("SUMMA", 14, y);
      pdf.text(String(totalBesok), 64, y);
      pdf.text(String(totalTimmar), 114, y);
      pdf.text(String(totalKunder), 164, y);
      pdf.save('statistik.pdf');

      // Logga export
      logExport('PDF', {
        dateRange: dateRange.from && dateRange.to ? `${dateRange.from.toLocaleDateString()} - ${dateRange.to.toLocaleDateString()}` : "Alla",
        selectedEfforts: selectedEfforts.length > 0 ? effortOptions.filter(e => selectedEfforts.includes(String(e.id))).map(e => e.name).join(", ") : "Alla",
        selectedEffortCategories: selectedEffortCategories.length > 0 ? selectedEffortCategories.map(formatCategoryLabel).join(", ") : "Alla",
        selectedGenders: selectedGenders.length > 0 ? selectedGenders.join(", ") : "Alla",
        selectedYears: selectedYears.length > 0 ? selectedYears.join(", ") : "Alla",
        selectedHandlers: selectedHandlers.length > 0 ? handlerOptions.filter(h => selectedHandlers.includes(String(h.id))).map(h => h.name).join(", ") : "Alla",
        selectedCustomers: selectedCustomers.length > 0 ? customerOptions
          .filter(c => selectedCustomers.includes(String(c.id)))
          .map(c => (c.is_group || c.isGroup ? `${c.initials} (Grupp)` : `${c.initials} (${c.birthYear ?? '—'})`))
          .join(", ") : "Alla"
      });
      toast.success("PDF exporterad!");
    } catch {
      toast.error("Kunde inte exportera PDF");
    }
  };

  const handleExportExcel = async () => {
    try {
      setIsExportingExcel(true);
      const XLSX = await import('xlsx');
      const params = buildParams();
      const [
        rawData,
        effortExport,
        handlerExport,
        genderExport,
        birthYearExport,
      ] = await Promise.all([
        getStatsRaw(params),
        effortData ? Promise.resolve(effortData) : getStatsByEffort(params),
        handlerData ? Promise.resolve(handlerData) : getStatsByHandler(params),
        genderData ? Promise.resolve(genderData) : getStatsByGender(params),
        birthYearData ? Promise.resolve(birthYearData) : getStatsByBirthYear(params),
      ]);

      const safeEffortExport: StatsSeriesRow[] = effortExport ?? [];
      const safeHandlerExport: StatsSeriesRow[] = handlerExport ?? [];
      const safeGenderExport: StatsSeriesRow[] = genderExport ?? [];
      const safeBirthYearExport: BirthYearStatsRow[] = (birthYearExport ?? []) as BirthYearStatsRow[];

      // Bygg filterinfo
      const filterRows = [
        ["Exportdatum:", new Date().toLocaleString("sv-SE")],
        ["Tidsperiod:", dateRange.from && dateRange.to ? `${dateRange.from.toLocaleDateString()} - ${dateRange.to.toLocaleDateString()}` : "Alla"],
        ["Kön:", selectedGenders.length > 0 ? selectedGenders.join(", ") : "Alla"],
        ["Födelseår:", selectedYears.length > 0 ? selectedYears.join(", ") : "Alla"],
        ["Insats:", selectedEfforts.length > 0 ? effortOptions.filter(e => selectedEfforts.includes(String(e.id))).map(e => e.name).join(", ") : "Alla"],
        ["Insatskategori:", selectedEffortCategories.length > 0 ? selectedEffortCategories.map(formatCategoryLabel).join(", ") : "Alla"],
        ["Behandlare:", selectedHandlers.length > 0 ? handlerOptions.filter(h => selectedHandlers.includes(String(h.id))).map(h => h.name).join(", ") : "Alla"],
        ["Kund:", selectedCustomers.length > 0 ? customerOptions
          .filter(c => selectedCustomers.includes(String(c.id)))
          .map(c => (c.is_group || c.isGroup ? `${c.initials} (Grupp)` : `${c.initials} (${c.birthYear ?? '—'})`))
          .join(", ") : "Alla"],
        [],
      ];

      const tableHeader = [
        "Insats",
        "Antal besök",
        "Antal timmar",
        "Antal kunder"
      ];
      const tableRows = safeEffortExport.map((row) => [
        row.effort_name,
        Number(row.antal_besok || 0),
        Number(row.totala_timmar || 0),
        Number(row.antal_kunder || 0)
      ]);
      const totalBesok = safeEffortExport.reduce((sum, row) => sum + Number(row.antal_besok || 0), 0);
      const totalTimmar = safeEffortExport.reduce((sum, row) => sum + Number(row.totala_timmar || 0), 0);
      const totalKunder = safeEffortExport.reduce((sum, row) => sum + Number(row.antal_kunder || 0), 0);
      const summaryRow = ["SUMMA", totalBesok, totalTimmar, totalKunder];
      const summarySheetData = [
        ["Statistikrapport"],
        ...filterRows,
        tableHeader,
        ...tableRows,
        summaryRow
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetData);

      const detailHeader = [
        "Besök-ID",
        "Datum",
        "Status",
        "Timmar",
        "Insats",
        "Insats-ID",
        "Kund",
        "Kund-ID",
        "Kundtyp",
        "Födelseår",
        "Kön",
        "Case-ID",
        "Case aktiv",
        "Kund aktiv",
        "Behandlare 1",
        "Behandlare 2"
      ];

      const detailRows = rawData.map(item => {
        const dateValue = item.date;
        const formattedDate =
          typeof dateValue === 'string' || typeof dateValue === 'number'
            ? new Date(dateValue).toISOString().slice(0, 10)
            : '';

        return [
          item.shift_id ?? '',
          formattedDate,
          item.status ?? '',
          Number(item.hours ?? 0),
          item.effort_name ?? '',
          item.effort_id ?? '',
          item.customer_initials ?? '',
          item.customer_id ?? '',
          item.customer_is_group ? 'Grupp' : 'Individ',
          item.customer_birth_year ?? '',
          item.customer_gender ?? '',
          item.case_id ?? '',
          item.case_active ? 'Ja' : 'Nej',
          item.customer_active ? 'Ja' : 'Nej',
          item.handler1_name ?? '',
          item.handler2_name ?? ''
        ];
      });

      const detailSummary = rawData.reduce((acc, item) => acc + Number(item.hours ?? 0), 0);
      const detailSummaryRow = Array(detailHeader.length).fill('');
      detailSummaryRow[0] = 'SUMMA';
      detailSummaryRow[3] = detailSummary;
      const detailSheetData = [
        ["Detaljerad statistik"],
        ["Antal poster", rawData.length],
        [],
        detailHeader,
        ...detailRows,
        detailSummaryRow
      ];

      const detailSheet = XLSX.utils.aoa_to_sheet(detailSheetData);
      const lastDetailRow = detailRows.length + 4;
      detailSheet['!autofilter'] = { ref: `A4:${String.fromCharCode(65 + detailHeader.length - 1)}${lastDetailRow}` };

      const handlerSheetData = [
        ["Behandlare"],
        ["Namn", "Besök", "Totala timmar"],
        ...safeHandlerExport.map((row) => [
          row.handler_name || 'Okänd',
          Number(row.antal_besok || 0),
          Number(row.totala_timmar || 0),
        ])
      ];
      const handlerSheet = XLSX.utils.aoa_to_sheet(handlerSheetData);
      handlerSheet['!autofilter'] = { ref: `A2:C${safeHandlerExport.length + 2}` };

      const genderSheetData = [
        ["Kön"],
        ["Kön", "Besök", "Totala timmar"],
        ...safeGenderExport.map((row) => [
          row.gender || 'Okänd',
          Number(row.antal_besok || 0),
          Number(row.totala_timmar || 0),
        ])
      ];
      const genderSheet = XLSX.utils.aoa_to_sheet(genderSheetData);
      genderSheet['!autofilter'] = { ref: `A2:C${safeGenderExport.length + 2}` };

      const birthYearSheetData = [
        ["Födelseår"],
        ["Födelseår", "Kunder", "Besök", "Totala timmar", "Snitt timmar (Utförd)"],
        ...safeBirthYearExport.map((row) => [
          row.label ?? 'Okänt',
          Number(row.antal_kunder || 0),
          Number(row.antal_besok || 0),
          Number(row.totala_timmar || 0),
          Number(row.snitt_timmar || 0),
        ])
      ];
      const birthYearSheet = XLSX.utils.aoa_to_sheet(birthYearSheetData);
      birthYearSheet['!autofilter'] = { ref: `A2:E${safeBirthYearExport.length + 2}` };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Statistik');
      XLSX.utils.book_append_sheet(wb, detailSheet, 'Detaljer');
      XLSX.utils.book_append_sheet(wb, handlerSheet, 'Behandlare');
      XLSX.utils.book_append_sheet(wb, genderSheet, 'Kön');
      XLSX.utils.book_append_sheet(wb, birthYearSheet, 'Födelseår');
      XLSX.writeFile(wb, 'statistik.xlsx');
      
      logExport('Excel', {
        dateRange: dateRange.from && dateRange.to ? `${dateRange.from.toLocaleDateString()} - ${dateRange.to.toLocaleDateString()}` : "Alla",
        selectedEfforts: selectedEfforts.length > 0 ? effortOptions.filter(e => selectedEfforts.includes(String(e.id))).map(e => e.name).join(", ") : "Alla",
        selectedEffortCategories: selectedEffortCategories.length > 0 ? selectedEffortCategories.map(formatCategoryLabel).join(", ") : "Alla",
        selectedGenders: selectedGenders.length > 0 ? selectedGenders.join(", ") : "Alla",
        selectedYears: selectedYears.length > 0 ? selectedYears.join(", ") : "Alla",
        selectedHandlers: selectedHandlers.length > 0 ? handlerOptions.filter(h => selectedHandlers.includes(String(h.id))).map(h => h.name).join(", ") : "Alla",
        selectedCustomers: selectedCustomers.length > 0 ? customerOptions
          .filter(c => selectedCustomers.includes(String(c.id)))
          .map(c => (c.is_group || c.isGroup ? `${c.initials} (Grupp)` : `${c.initials} (${c.birthYear ?? '—'})`))
          .join(", ") : "Alla"
      });
      
      toast.success(`Excel exporterad! (${rawData.length} rader)`);
    } catch (error) {
      console.error('Excel export failed:', error);
      toast.error("Kunde inte exportera Excel");
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <Layout title="Statistik">
      <div className="flex flex-col w-full max-w-full sm:max-w-2xl lg:max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 gap-4 sm:gap-6 lg:gap-8 py-2 sm:py-4">

      <div className="space-y-4 sm:space-y-6">
        {/* Filterrad */}
        {!isTabletUp ? (
          <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-200 w-full" data-tour="stats-filter-mobile">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              onClick={() => setMobileFiltersOpen(open => !open)}
            >
              <span className="text-base font-medium text-gray-900">Filtrera</span>
              <ChevronDown className={`w-5 h-5 transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`} />
            </button>
            {mobileFiltersOpen && (
              <div className="px-4 pb-4 pt-2 space-y-3">
                {renderFilterFields()}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4 bg-white rounded-lg sm:rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 w-full" data-tour="stats-filter-desktop">
            <div className="flex items-center justify-between">
              <label className="font-normal text-base sm:text-lg text-gray-900">Filtrera</label>
            </div>
            {renderFilterFields()}
          </div>
        )}

        {/* Statistik-kort */}
        {loading ? (
          <div className="flex justify-center items-center py-12 sm:py-16">
            <Loader2 className="animate-spin w-8 h-8 sm:w-10 sm:h-10 text-[var(--tenant-brand)] mr-3" />
            <span className="text-base sm:text-lg text-[var(--tenant-brand)]">Laddar statistik...</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-center" data-tour="stats-summary-cards">
            <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-5 lg:p-6 flex flex-col items-center justify-center shadow-sm min-h-[80px] sm:min-h-[100px]">
              <div className="text-gray-600 text-[11px] sm:text-xs lg:text-sm font-medium mb-2 sm:mb-3 tracking-wide uppercase leading-tight">Antal besök</div>
              <div className="text-[#222] text-xl sm:text-2xl lg:text-3xl font-light">{stats ? stats.antal_besok.toLocaleString() : "-"}</div>
            </div>
            <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-5 lg:p-6 flex flex-col items-center justify-center shadow-sm min-h-[80px] sm:min-h-[100px]">
              <div className="text-gray-600 text-[11px] sm:text-xs lg:text-sm font-medium mb-2 sm:mb-3 tracking-wide uppercase leading-tight">Antal kunder</div>
              <div className="text-[#222] text-xl sm:text-2xl lg:text-3xl font-light">{stats ? stats.antal_kunder : "-"}</div>
            </div>
            <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-5 lg:p-6 flex flex-col items-center justify-center shadow-sm min-h-[80px] sm:min-h-[100px]">
              <div className="text-gray-600 text-[11px] sm:text-xs lg:text-sm font-medium mb-2 sm:mb-3 tracking-wide uppercase leading-tight">Besökstimmar</div>
              <div className="text-[#222] text-xl sm:text-2xl lg:text-3xl font-light">
                {stats ? `${stats.totala_timmar.toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}` : "-"}
              </div>
            </div>
            <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-5 lg:p-6 flex flex-col items-center justify-center shadow-sm min-h-[80px] sm:min-h-[100px]">
              <div className="text-gray-600 text-[11px] sm:text-xs lg:text-sm font-medium mb-2 sm:mb-3 tracking-wide uppercase leading-tight">Avbokningsgrad</div>
              <div className="text-[#222] text-xl sm:text-2xl lg:text-3xl font-light">{stats ? `${stats.avbokningsgrad}%` : "-"}</div>
            </div>
          </div>
        )}

        <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)} className="w-full min-w-0">
          <TabsList className="grid grid-cols-2 mobile:grid-cols-4 gap-2 bg-gray-100 rounded-lg mobile:rounded-2xl p-1">
            {viewOptions.map(option => (
              <TabsTrigger
                key={option.value}
                value={option.value}
                className="text-xs mobile:text-sm rounded-lg mobile:rounded-xl data-[state=active]:bg-white data-[state=active]:text-[var(--tenant-brand)] data-[state=active]:shadow-sm py-2 mobile:py-2.5 font-medium"
              >
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Diagramkort */}
        <div ref={chartRef} className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-6 flex flex-col items-center relative shadow-sm min-w-0" data-tour="stats-chart">
          {showChart ? (
            <>
              <div className="text-sm sm:text-base font-medium text-gray-800 mb-2 sm:mb-4 text-center">
                {chartTitle}{' '}
                <span className="text-gray-400 text-xs">({yearLabel})</span>
              </div>
              {hasChartData ? (
                <>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 text-xs text-gray-500 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full bg-[var(--tenant-brand)]" /> {chartPrimaryLabel}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full bg-[#1769dc]" /> {chartSecondaryLabel}
                    </div>
                  </div>
                  <div className="w-full mb-4 mobile:mb-6 overflow-x-auto">
                    <div className="flex h-48 mobile:h-56 laptop:h-72 pl-1 pr-2 mobile:pr-4 laptop:pl-2 laptop:pr-4" style={{ minWidth: 'max-content' }}>
                      <div className="flex flex-col justify-between items-end pr-1 mobile:pr-2 laptop:pr-5 py-2 w-8 mobile:w-10 laptop:w-16 select-none flex-shrink-0">
                        {chartScale.ticks.slice().reverse().map((tick, idx) => (
                          <span key={`${tick}-${idx}`} className="text-[10px] mobile:text-xs text-gray-400 tabular-nums">
                            {formatAxisTick(tick)}
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-col h-full flex-shrink-0">
                        <div className="flex items-end justify-start gap-1 mobile:gap-2 laptop:gap-4 xl:gap-6 flex-1 pb-4" style={{ width: `${chartData.length * 30}px` }}>
                          {chartData.map((item, idx) => {
                            const primaryHeight = Math.max(((Number(item.primaryValue) || 0) / chartScale.niceMax) * barChartHeight, minBarHeight);
                            const secondaryHeight = Math.max(((Number(item.secondaryValue) || 0) / chartScale.niceMax) * barChartHeight, minBarHeight);

                            return (
                              <div key={idx} className="flex flex-col items-center flex-shrink-0 w-[25px] mobile:w-[30px] laptop:w-[40px] xl:w-[50px]">
                                <div
                                  className="flex gap-0.5 mobile:gap-1 laptop:gap-2 items-end w-full justify-center mb-2"
                                  style={{ height: `${barChartHeight}px` }}
                                >
                                  <div
                                    className="bg-[var(--tenant-brand)] rounded-lg transition-all duration-700 cursor-pointer relative"
                                    style={{
                                      width: '8px',
                                      height: `${primaryHeight}px`,
                                      minHeight: minBarHeight,
                                    }}
                                    onMouseEnter={e => {
                                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                                      setTooltip({
                                        x: rect.left + rect.width / 2,
                                        y: rect.top,
                                        value: `${chartPrimaryLabel}: ${Number(item.primaryValue || 0).toLocaleString('sv-SE')}`
                                      });
                                    }}
                                    onMouseLeave={() => setTooltip(null)}
                                  />
                                  <div
                                    className="bg-[#1769dc] rounded-lg transition-all duration-700 cursor-pointer relative"
                                    style={{
                                      width: '8px',
                                      height: `${secondaryHeight}px`,
                                      minHeight: minBarHeight,
                                    }}
                                    onMouseEnter={e => {
                                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                                      setTooltip({
                                        x: rect.left + rect.width / 2,
                                        y: rect.top,
                                        value: `${chartSecondaryLabel}: ${Number(item.secondaryValue || 0).toLocaleString('sv-SE')}${chartSecondarySuffix ?? ''}`
                                      });
                                    }}
                                    onMouseLeave={() => setTooltip(null)}
                                  />
                                </div>
                                <span className="text-[5px] mobile:text-[6px] laptop:text-[7px] text-gray-600 text-center leading-tight whitespace-nowrap overflow-hidden max-w-full">
                                  {item.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    {tooltip && (
                      <div
                        className="pointer-events-none fixed z-50 px-3 py-1.5 rounded-lg bg-white shadow text-sm text-[var(--tenant-brand)] font-medium border border-gray-200"
                        style={{
                          left: tooltip.x,
                          top: tooltip.y - 36,
                          transform: 'translate(-50%, -100%)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {tooltip.value}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between w-full text-[10px] sm:text-[11px] text-gray-500 px-1 sm:px-2">
                    <span>{yAxisLabel}</span>
                    <span>{xAxisLabel}</span>
                  </div>
                </>
              ) : (
                <div className="text-gray-400 text-sm py-10">Ingen data att visa för valt filter.</div>
              )}
            </>
          ) : (
            <div className="text-gray-500 text-sm py-6 text-center w-full">
              Insatsvyn visar ingen graf. Scrolla ned för att se hela listan på insats.
            </div>
          )}
        </div>

        {/* Export-knappar utanför diagrammet */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
          <Button variant="outline" className="rounded-lg text-sm font-medium w-full sm:w-auto" onClick={handleExportPDF} data-tour="stats-export-pdf">Exportera som PDF</Button>
          <Button
            className="rounded-lg text-sm font-medium w-full sm:w-auto"
            variant="outline"
            onClick={handleExportExcel}
            data-tour="stats-export-excel"
            disabled={loading || isExportingExcel}
          >
            {isExportingExcel ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Exporterar...
              </span>
            ) : (
              'Ladda ner som Excel'
            )}
          </Button>
        </div>

        <div className="mt-6 w-full text-left justify-center items-center">
          {renderAggregatedTable()}
        </div>
      </div>

      </div>
    </Layout>
  );
};
