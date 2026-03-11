import { X } from "lucide-react";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { BarChartStatistik } from "./BarChartStatistik";
import { PieChart as RePieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { createCustomer, createCase, getCases, addShift, getStatsSummary, getStatsByEffort, getStatsCases, getPublicHandlers, getStatsRaw, getStatsByHandler, getStatsByGender, getStatsByBirthYear, type HandlerPublic, type StatsRow, type StatsFilterParams } from '@/lib/api';
import { KundCombobox } from "@/components/ui/kund-combobox";
import { InsatsCombobox } from "@/components/ui/insats-combobox";
import { BehandlareCombobox } from "@/components/ui/behandlare-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import toast from 'react-hot-toast';
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useRefresh } from "@/contexts/RefreshContext";
import { CaseWithNames, StatsSummary } from "@/types/types";

type EffortStatsRow = {
  effort_name: string;
  antal_besok: number;
  antal_kunder: number;
};

type CaseStatsRow = {
  customer_id: number | null;
  antal_besok: number;
  totala_timmar: number;
};

const toEffortStats = (rows: StatsRow[]): EffortStatsRow[] =>
  rows.map(row => ({
    effort_name: String(row.effort_name ?? ""),
    antal_besok: Number(row.antal_besok ?? 0),
    antal_kunder: Number(row.antal_kunder ?? 0),
  }));

const toCaseStats = (rows: StatsRow[]): CaseStatsRow[] =>
  rows.map(row => ({
    customer_id: row.customer_id ? Number(row.customer_id) : null,
    antal_besok: Number(row.antal_besok ?? 0),
    totala_timmar: Number(row.totala_timmar ?? 0),
  }));

export const MainContent = (): JSX.Element => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refreshKey, triggerRefresh } = useRefresh();
  // Dynamisk statistik
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [effortData, setEffortData] = useState<EffortStatsRow[] | null>(null);
  const [caseStats, setCaseStats] = useState<CaseStatsRow[] | null>(null);
  const [handlers, setHandlers] = useState<HandlerPublic[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const formatLocalDate = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Memoized date calculations
  const dateRange = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      from: formatLocalDate(monthStart),
      to: formatLocalDate(monthEnd),
    };
  }, [formatLocalDate]);

  const monthLabel = useMemo(() => {
    const baseDate = new Date(`${dateRange.from}T00:00:00`);
    return baseDate.toLocaleString('sv-SE', { month: 'long', year: 'numeric' });
  }, [dateRange]);

  // Memoized data loading function
  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Ladda data parallellt men med bättre felhantering
      const [statsResult, effortResult, casesResult, handlersResult] = await Promise.allSettled([
        getStatsSummary(dateRange),
        getStatsByEffort(dateRange),
        getStatsCases(dateRange),
        getPublicHandlers()
      ]);
      
      // Hantera resultaten
      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value);
      }
      
      if (effortResult.status === 'fulfilled') {
        setEffortData(toEffortStats(effortResult.value));
      }
      
      if (casesResult.status === 'fulfilled') {
        setCaseStats(toCaseStats(casesResult.value));
      }
      
      if (handlersResult.status === 'fulfilled') {
        setHandlers(handlersResult.value);
      } 
    } catch (error) {
      console.error("Dashboard data load error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    // Vänta på att användaren är autentiserad
    if (!user) return;
    
    // Ladda data med en liten fördröjning för att säkerställa att token är redo
    const timer = setTimeout(loadDashboardData, 100);
    return () => clearTimeout(timer);
  }, [user, loadDashboardData, refreshKey]);

  const periodSummary = useMemo(() => {
    if (!caseStats || caseStats.length === 0) return null;
    const customers = new Set<number>();
    let visits = 0;
    let hours = 0;

    caseStats.forEach(row => {
      if (row.customer_id) {
        customers.add(Number(row.customer_id));
      }
      visits += Number(row.antal_besok ?? 0);
      hours += Number(row.totala_timmar ?? 0);
    });

    return {
      customers: customers.size,
      cases: caseStats.length,
      visits,
      hours,
    };
  }, [caseStats]);

  // Memoized stats cards
  const statsCards = useMemo(() => {
    const nyaKunder = stats?.ny_antal_kunder ?? periodSummary?.customers ?? stats?.antal_kunder ?? stats?.aktiva_kunder_total ?? 0;
    const nyaInsatser = stats?.ny_antal_insatser ?? periodSummary?.cases ?? stats?.aktiva_insatser_total ?? 0;
    const totalBesok = periodSummary?.visits ?? stats?.antal_besok ?? 0;
    const totalHours = periodSummary?.hours ?? stats?.totala_timmar ?? 0;

    return [
      {
        title: "Nya kunder",
        value: nyaKunder ?? "-",
        note: "Registrerade besök under perioden",
      },
      {
        title: "Nya insatser",
        value: nyaInsatser ?? "-",
        note: "Insatser med registrerade besök",
      },
      {
        title: "Antal besök",
        value: totalBesok ?? "-",
        note: "Totala besök för månaden",
      },
      {
        title: "Utförda besökstimmar",
        value: `${totalHours.toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} `,
        note: "Totala besökstimmar för månaden",
      },
    ];
  }, [stats, periodSummary]);

  // Memoized chart data
  const chartData = useMemo(() => 
    effortData
      ? effortData.map(d => ({
          label: d.effort_name,
          besok: Number(d.antal_besok),
          kunder: Number(d.antal_kunder),
        }))
      : [], 
    [effortData]
  );

  const [openModal, setOpenModal] = useState<null | "kund" | "tid" | "statistik" | "ny-insats">(null);

  // Form state för Lägg till kund
  const [newCustomer, setNewCustomer] = useState({
    initials: "",
    gender: "",
    birthYear: "",
    isGroup: false,
  });

  const [errors, setErrors] = useState<{ initials?: string; gender?: string; birthYear?: string }>({});

  // Memoized validation function
  const validateCustomer = useCallback((c: typeof newCustomer) => {
    const err: { initials?: string; gender?: string; birthYear?: string } = {};
    if (!c.initials) err.initials = "Obligatoriskt fält";
    if (!c.isGroup) {
      if (!c.gender) err.gender = "Obligatoriskt fält";
      if (!c.birthYear) err.birthYear = "Obligatoriskt fält";
      else if (!/^\d{4}$/.test(c.birthYear)) err.birthYear = "Födelseår måste vara 4 siffror";
    }
    return err;
  }, []);

  const handleCustomerChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = e.target;
    const isCheckbox = target instanceof HTMLInputElement && target.type === 'checkbox';
    let value: string | boolean = isCheckbox ? target.checked : target.value;

    if (target.name === 'initials' && typeof value === 'string') {
      value = value.toUpperCase();
    }

    let updated = { ...newCustomer, [target.name]: value } as typeof newCustomer;
    if (target.name === 'isGroup' && value === true) {
      updated = { ...updated, gender: '', birthYear: '' };
    }
    setNewCustomer(updated);
    setErrors(validateCustomer(updated));
  }, [newCustomer, validateCustomer]);

  const handleCustomerCancel = useCallback(() => {
    setOpenModal(null);
    setNewCustomer({ initials: "", gender: "", birthYear: "", isGroup: false });
    setErrors({});
  }, []);

  const handleCustomerSave = useCallback(async () => {
    const newErrors = validateCustomer(newCustomer);
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;
    try {
      await createCustomer({
        initials: newCustomer.initials,
        gender: newCustomer.isGroup ? undefined : newCustomer.gender,
        birthYear: newCustomer.isGroup ? undefined : Number(newCustomer.birthYear),
        isGroup: newCustomer.isGroup,
      });
      setOpenModal(null);
      setNewCustomer({ initials: '', gender: '', birthYear: '', isGroup: false });
      toast.success('Kund registrerad!');
      setErrors({});
      await loadDashboardData();
      triggerRefresh();
    } catch (err) {
      toast.error('Kunde inte spara kund');
    }
  }, [newCustomer, validateCustomer, triggerRefresh, loadDashboardData]);

  // Form state för Registrera insats
  const [newCase, setNewCase] = useState({
    customerId: "",
    effortId: "",
    handler1Id: "",
    handler2Id: "",
  });

  const [newCaseErrors, setNewCaseErrors] = useState<{ customerId?: string; effortId?: string; handler1Id?: string }>({});
  const [activeCases, setActiveCases] = useState<CaseWithNames[]>([]);

  const getToday = useCallback(() => new Date().toISOString().slice(0, 10), []);

  // Memoized case loading function
  const loadActiveCases = useCallback(async () => {
    try {
      const cases = await getCases(false);
      setActiveCases(cases);
    } catch (error) {
      console.error("Failed to load active cases:", error);
    }
  }, []);

  useEffect(() => {
    // Ladda aktiva insatsen när tid-modalen öppnas
    if (openModal === "tid") {
      loadActiveCases();
    }
  }, [openModal, loadActiveCases]);

  // Ladda aktiva insatsen för dashboard-kortet
  useEffect(() => {
    loadActiveCases();
  }, [loadActiveCases, refreshKey]);

  const validateNewCase = useCallback((c: typeof newCase) => {
    const err: { customerId?: string; effortId?: string; handler1Id?: string } = {};
    if (!c.customerId) err.customerId = "Du måste välja kund";
    if (!c.effortId) err.effortId = "Du måste välja insats";
    if (!c.handler1Id) err.handler1Id = "Du måste välja behandlare";
    return err;
  }, []);

  // Hjälpfunktion för att räkna faktiska fel (inte undefined värden)
  function getActualErrorCount(errors: typeof newCaseErrors): number {
    return Object.keys(errors).filter(key => errors[key as keyof typeof errors]).length;
  }

  const handleNewCaseChange = useCallback((field: string, value: string) => {
    const updated = { ...newCase, [field]: value };
    setNewCase(updated);
    setNewCaseErrors(prev => ({ ...prev, [field]: undefined }));
  }, [newCase]);

  const handleNewCaseCancel = useCallback(() => {
    setOpenModal(null);
    setNewCase({ customerId: "", effortId: "", handler1Id: "", handler2Id: "" });
    setNewCaseErrors({});
  }, []);

  const handleNewCaseSave = useCallback(async () => {
    const newErrors = validateNewCase(newCase);
    setNewCaseErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      return;
    }

    try {
      await createCase({
        customer_id: Number(newCase.customerId),
        effort_id: Number(newCase.effortId),
        handler1_id: Number(newCase.handler1Id),
        handler2_id: newCase.handler2Id ? Number(newCase.handler2Id) : null,
        active: true
      });
      
      setOpenModal(null);
      setNewCase({ customerId: "", effortId: "", handler1Id: "", handler2Id: "" });
      toast.success('Insats registrerad!');
      setNewCaseErrors({});
      await loadDashboardData();
      triggerRefresh();
    } catch (err: unknown) {
      const parsed = err as { error?: string; message?: string } | undefined;
      const errorMessage = parsed?.error || parsed?.message;
      const duplicatePhrase = 'samma kombination finns redan';

      if (errorMessage?.includes(duplicatePhrase)) {
        const toastMessage = parsed?.error || 'En aktiv insats med samma kombination finns redan för denna kund. Du kan inte skapa flera identiska insatser.';
        toast.error(toastMessage, { duration: 8000 });
      } else {
        toast.error('Kunde inte skapa insats');
      }
    }
  }, [newCase, validateNewCase, triggerRefresh, loadDashboardData]);

  // Form state för Registrera tid
  const [registerTime, setRegisterTime] = useState({
    customer: "",   // ska vara ett ID (sträng eller siffra)
    effort: "",     // ska vara ett ID
    handler: "",    // ska vara ett ID
    secondary: "",  // ska vara ett ID eller tom sträng
    date: "",
    hours: ""
  });
  const [registerTimeErrors, setRegisterTimeErrors] = useState<{ customer?: string; date?: string; hours?: string }>({});

  const handleRegisterTimeChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setRegisterTime({
      ...registerTime,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    });
    setRegisterTimeErrors(prev => ({ ...prev, [name]: undefined }));
  }, [registerTime]);

  const validateRegisterTime = useCallback((rt: typeof registerTime) => {
    const err: { customer?: string; date?: string; hours?: string } = {};
    if (!rt.customer) err.customer = "Du måste välja insats";
    if (!rt.date) err.date = "Du måste ange datum";
    if (!rt.hours || isNaN(Number(rt.hours)) || Number(rt.hours) <= 0) err.hours = "Du måste ange antal timmar";
    return err;
  }, []);

  const handleRegisterTimeCancel = useCallback(() => {
    setOpenModal(null);
    setRegisterTime({
      customer: "",
      effort: "",
      handler: "",
      secondary: "",
      date: getToday(),
      hours: "",
    });
    setRegisterTimeErrors({});
  }, [getToday]);

  const handleRegisterTimeSave = useCallback(async () => {
    const errors = validateRegisterTime(registerTime);
    setRegisterTimeErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    try {
      // Find the selected case to get its details
      const selectedCase = activeCases.find(c => c.id.toString() === registerTime.customer);
      if (!selectedCase) {
        toast.error("Välj insats");
        return;
      }

      const shiftData = {
        case_id: selectedCase.id,
        date: registerTime.date,
        hours: Number(registerTime.hours),
        status: "Utförd" as const
      };

      await addShift(shiftData);
      
      // Nollställ formuläret eller visa feedback
      setRegisterTime({
        customer: "",
        effort: "",
        handler: "",
        secondary: "",
        date: getToday(),
        hours: "",
      });
      setOpenModal(null);
      toast.success("Tid registrerad!");
      await loadDashboardData();
      triggerRefresh();
    } catch (err) {
      toast.error("Kunde inte spara tid");
    }
  }, [registerTime, activeCases, triggerRefresh, loadDashboardData, validateRegisterTime, getToday]);

  // Form state för Ta ut statistik
  const [statistik, setStatistik] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    to: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10),
    effortCategory: [] as string[],
    handler: [] as string[],
    gender: [] as string[],
    effort: [] as string[],
  });



  const [showStatistikChart, setShowStatistikChart] = useState(false);

  const handleStatistikApply = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Hämta ny data baserat på filter
    try {
      const filteredStats = await getStatsSummary({
        from: statistik.from,
        to: statistik.to,
        effortCategory: statistik.effortCategory.length > 0 ? statistik.effortCategory.join(',') : undefined,
        handler: statistik.handler.length > 0 ? statistik.handler.join(',') : undefined,
        gender: statistik.gender.length > 0 ? statistik.gender.join(',') : undefined,
        insats: statistik.effort.length > 0 ? statistik.effort.join(',') : undefined
      });
      
      const filteredEffortData = await getStatsByEffort({
        from: statistik.from,
        to: statistik.to,
        effortCategory: statistik.effortCategory.length > 0 ? statistik.effortCategory.join(',') : undefined,
        handler: statistik.handler.length > 0 ? statistik.handler.join(',') : undefined,
        gender: statistik.gender.length > 0 ? statistik.gender.join(',') : undefined,
        insats: statistik.effort.length > 0 ? statistik.effort.join(',') : undefined
      });
      const filteredCases = await getStatsCases({
        from: statistik.from,
        to: statistik.to,
        effortCategory: statistik.effortCategory.length > 0 ? statistik.effortCategory.join(',') : undefined,
        handler: statistik.handler.length > 0 ? statistik.handler.join(',') : undefined,
        gender: statistik.gender.length > 0 ? statistik.gender.join(',') : undefined,
        insats: statistik.effort.length > 0 ? statistik.effort.join(',') : undefined
      });
      
      setStats(filteredStats);
      setEffortData(toEffortStats(filteredEffortData));
      setCaseStats(toCaseStats(filteredCases));
      setShowStatistikChart(true);
    } catch (error) {
      toast.error('Kunde inte hämta filtrerad data');
    }
  }, [statistik]);

  const handleStatistikCancel = useCallback(() => {
    setOpenModal(null);
    setStatistik({ 
      from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      to: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10),
      effortCategory: [], 
      handler: [], 
      gender: [], 
      effort: [] 
    });
    setShowStatistikChart(false);
  }, []);

  const [isExporting, setIsExporting] = useState(false);

  const buildFilterParams = useCallback((): StatsFilterParams => ({
    from: statistik.from,
    to: statistik.to,
    effortCategory: statistik.effortCategory.length > 0 ? statistik.effortCategory.join(',') : undefined,
    handler: statistik.handler.length > 0 ? statistik.handler.join(',') : undefined,
    gender: statistik.gender.length > 0 ? statistik.gender.join(',') : undefined,
    insats: statistik.effort.length > 0 ? statistik.effort.join(',') : undefined,
  }), [statistik]);

  const filterSummaryRows = useCallback(() => {
    return [
      `Tidsperiod: ${statistik.from} – ${statistik.to}`,
      `Insatskategori: ${statistik.effortCategory.length > 0 ? statistik.effortCategory.join(', ') : 'Alla'}`,
      `Behandlare: ${statistik.handler.length > 0 ? handlers?.filter(h => statistik.handler.includes(h.id)).map(h => h.name).join(', ') : 'Alla'}`,
      `Kön: ${statistik.gender.length > 0 ? statistik.gender.join(', ') : 'Alla'}`,
      `Insats: ${statistik.effort.length > 0 ? statistik.effort.join(', ') : 'Alla'}`,
    ];
  }, [statistik, handlers]);

  // Exportfunktioner
  const handleExportPDF = useCallback(async () => {
    try {
      setIsExporting(true);
      const input = document.getElementById('statistik-export');
      if (!input) return toast.error('Kunde inte hitta diagrammet för export');
      const params = buildFilterParams();
      const effortExport = await getStatsByEffort(params);

      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(input);
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape' });

      // Rubrik och datum
      pdf.setFontSize(18);
      pdf.text('Statistikrapport', 14, 18);
      pdf.setFontSize(10);
      pdf.text(`Exportdatum: ${new Date().toLocaleString('sv-SE')}`, 14, 26);

      // Filterinfo
      let y = 34;
      filterSummaryRows().forEach(row => {
        pdf.text(row, 14, y);
        y += 7;
      });

      // Diagram
      pdf.addImage(imgData, 'PNG', 14, y, 120, 60);
      y += 68;

      // Tabellhuvud
      pdf.setFontSize(12);
      pdf.text('Insats', 14, y);
      pdf.text('Antal besök', 64, y);
      pdf.text('Antal timmar', 114, y);
      pdf.text('Antal kunder', 164, y);
      y += 7;
      pdf.setFontSize(10);

      // Tabellrader
      const safeEffort = effortExport ?? [];
      safeEffort.forEach(d => {
        pdf.text(String(d.effort_name ?? ''), 14, y);
        pdf.text(String(d.antal_besok ?? 0), 64, y);
        pdf.text(String(d.totala_timmar ?? 0), 114, y);
        pdf.text(String(d.antal_kunder ?? 0), 164, y);
        y += 6;
      });

      // Summering
      const totalBesok = safeEffort.reduce((sum, d) => sum + Number(d.antal_besok ?? 0), 0);
      const totalTimmar = safeEffort.reduce((sum, d) => sum + Number(d.totala_timmar ?? 0), 0);
      const totalKunder = safeEffort.reduce((sum, d) => sum + Number(d.antal_kunder ?? 0), 0);
      pdf.setFontSize(11);
      pdf.text('SUMMA', 14, y);
      pdf.text(String(totalBesok), 64, y);
      pdf.text(String(totalTimmar), 114, y);
      pdf.text(String(totalKunder), 164, y);

      pdf.save('statistik.pdf');
      toast.success('PDF exporterad!');
    } catch {
      toast.error('Kunde inte exportera PDF');
    } finally {
      setIsExporting(false);
    }
  }, [buildFilterParams, filterSummaryRows]);

  const handleExportExcel = useCallback(async () => {
    try {
      setIsExporting(true);
      const XLSX = await import('xlsx');
      const params = buildFilterParams();

      const [rawData, effortExport, handlerExport, genderExport, birthYearExport] = await Promise.all([
        getStatsRaw(params),
        getStatsByEffort(params),
        getStatsByHandler(params),
        getStatsByGender(params),
        getStatsByBirthYear(params),
      ]);

      const safeEffort = effortExport ?? [];
      const safeHandler = handlerExport ?? [];
      const safeGender = genderExport ?? [];
      const safeBirthYear = birthYearExport ?? [];

      // Filterinfo
      const filterRows = [
        ['Exportdatum:', new Date().toLocaleString('sv-SE')],
        ...filterSummaryRows().map(row => {
          const [label, ...rest] = row.split(': ');
          return [label + ':', rest.join(': ')];
        }),
        [],
      ];

      // Sammanfattning
      const tableHeader = ['Insats', 'Antal besök', 'Antal timmar', 'Antal kunder'];
      const tableRows = safeEffort.map(row => [
        row.effort_name,
        Number(row.antal_besok ?? 0),
        Number(row.totala_timmar ?? 0),
        Number(row.antal_kunder ?? 0),
      ]);
      const totalBesok = safeEffort.reduce((sum, row) => sum + Number(row.antal_besok ?? 0), 0);
      const totalTimmar = safeEffort.reduce((sum, row) => sum + Number(row.totala_timmar ?? 0), 0);
      const totalKunder = safeEffort.reduce((sum, row) => sum + Number(row.antal_kunder ?? 0), 0);
      const summarySheetData = [
        ['Statistikrapport'],
        ...filterRows,
        tableHeader,
        ...tableRows,
        ['SUMMA', totalBesok, totalTimmar, totalKunder],
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetData);

      // Detaljer
      const detailHeader = ['Besök-ID', 'Datum', 'Status', 'Timmar', 'Insats', 'Kund', 'Kundtyp', 'Födelseår', 'Kön', 'Behandlare 1', 'Behandlare 2'];
      const detailRows = (rawData ?? []).map(item => {
        const dateValue = item.date;
        const formattedDate = typeof dateValue === 'string' || typeof dateValue === 'number'
          ? new Date(dateValue).toISOString().slice(0, 10)
          : '';
        return [
          item.shift_id ?? '',
          formattedDate,
          item.status ?? '',
          Number(item.hours ?? 0),
          item.effort_name ?? '',
          item.customer_initials ?? '',
          item.customer_is_group ? 'Grupp' : 'Individ',
          item.customer_birth_year ?? '',
          item.customer_gender ?? '',
          item.handler1_name ?? '',
          item.handler2_name ?? '',
        ];
      });
      const detailSheetData = [
        ['Detaljerad statistik'],
        ['Antal poster', rawData?.length ?? 0],
        [],
        detailHeader,
        ...detailRows,
      ];
      const detailSheet = XLSX.utils.aoa_to_sheet(detailSheetData);

      // Behandlare
      const handlerSheetData = [
        ['Behandlare'],
        ['Namn', 'Besök', 'Totala timmar'],
        ...safeHandler.map(row => [row.handler_name ?? 'Okänd', Number(row.antal_besok ?? 0), Number(row.totala_timmar ?? 0)]),
      ];
      const handlerSheet = XLSX.utils.aoa_to_sheet(handlerSheetData);

      // Kön
      const genderSheetData = [
        ['Kön'],
        ['Kön', 'Besök', 'Totala timmar'],
        ...safeGender.map(row => [row.gender ?? 'Okänd', Number(row.antal_besok ?? 0), Number(row.totala_timmar ?? 0)]),
      ];
      const genderSheet = XLSX.utils.aoa_to_sheet(genderSheetData);

      // Födelseår
      const birthYearSheetData = [
        ['Födelseår'],
        ['Födelseår', 'Kunder', 'Besök', 'Totala timmar'],
        ...safeBirthYear.map(row => [row.label ?? 'Okänt', Number(row.antal_kunder ?? 0), Number(row.antal_besok ?? 0), Number(row.totala_timmar ?? 0)]),
      ];
      const birthYearSheet = XLSX.utils.aoa_to_sheet(birthYearSheetData);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Statistik');
      XLSX.utils.book_append_sheet(wb, detailSheet, 'Detaljer');
      XLSX.utils.book_append_sheet(wb, handlerSheet, 'Behandlare');
      XLSX.utils.book_append_sheet(wb, genderSheet, 'Kön');
      XLSX.utils.book_append_sheet(wb, birthYearSheet, 'Födelseår');
      XLSX.writeFile(wb, 'statistik.xlsx');

      toast.success(`Excel exporterad! (${rawData?.length ?? 0} rader)`);
    } catch {
      toast.error('Kunde inte exportera Excel');
    } finally {
      setIsExporting(false);
    }
  }, [buildFilterParams, filterSummaryRows]);

  // Navigera till olika sidor från dashboard-korten
  const handleCardClick = useCallback((destination: string) => {
    switch (destination) {
      case 'customers':
        navigate('/kunder');
        break;
      case 'cases':
        navigate('/arendelista');
        break;
      case 'visits':
        navigate('/statistik');
        break;
    }
  }, [navigate]);

  return (
    <div className="flex flex-col items-center min-h-screen">
      {/* Toaster is provided globally in src/index.tsx */}
      {/* Main Content Grid */}
      <div className="flex flex-col w-full max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 gap-4 sm:gap-6 lg:gap-8 py-2 sm:py-4">
        {/* Sammanfattning */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-light text-[#222]">Månadens överblick</h2>
            <p className="text-sm text-gray-500">{monthLabel}</p>
          </div>
          <p className="text-xs text-gray-400">Aktuella siffror uppdateras automatiskt</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 min-w-0 w-full" data-tour="stats-cards">
          {isLoading ? (
            // Loading state
            Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="bg-white rounded-lg sm:rounded-2xl shadow-sm p-3 sm:p-4 lg:p-6 flex flex-col justify-center animate-pulse"
              >
                <div className="h-3 sm:h-4 bg-gray-200 rounded w-20 sm:w-24 mb-2"></div>
                <div className="h-8 sm:h-10 bg-gray-200 rounded w-12 sm:w-16 mb-2"></div>
                <div className="h-2.5 sm:h-3 bg-gray-200 rounded w-24 sm:w-32"></div>
              </div>
            ))
          ) : (
            statsCards.map((card, index) => {
              const destinations = ['customers', 'cases', 'visits', 'visits'];
              return (
              <div
                key={index}
                className="bg-white rounded-lg sm:rounded-2xl shadow-sm p-3 sm:p-4 lg:p-6 flex flex-col justify-center cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleCardClick(destinations[index] ?? 'visits')}
              >
                <div className="text-gray-500 text-xs sm:text-sm font-semibold tracking-wide uppercase">
                  {card.title}
                </div>
                <div className="text-lg sm:text-2xl lg:text-3xl xl:text-4xl text-[#222] font-light mt-1 sm:mt-2">
                  {card.value}
                </div>
                {card.note && (
                  <div className="text-gray-400 text-[10px] sm:text-xs mt-1 sm:mt-2 font-light">
                    {card.note}
                  </div>
                )}
              </div>
            )})
          )}
        </div>
        {/* Snabbåtgärder */}
        <div className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-6 flex flex-col shadow-sm items-start" data-tour="quick-actions">
          <h3 className="text-[#333] text-base sm:text-lg font-light mb-3 sm:mb-4 lg:mb-6 tracking-tight">Snabbåtgärder</h3>
          <div className="grid w-full gap-2 sm:gap-3 lg:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Button
              variant="outline"
              className="w-full rounded-lg border border-gray-200 text-[var(--tenant-brand)] font-normal text-sm sm:text-base bg-white hover:bg-[var(--tenant-brand-soft)] transition px-3 sm:px-4 lg:px-7 py-2.5 sm:py-3"
              onClick={() => setOpenModal("kund")}
              data-tour="add-customer-btn"
            >
              + Lägg till kund
            </Button>
            <Button
              variant="outline"
              className="w-full rounded-lg border border-gray-200 text-[var(--tenant-brand)] font-normal text-sm sm:text-base bg-white hover:bg-[var(--tenant-brand-soft)] transition px-3 sm:px-4 lg:px-7 py-2.5 sm:py-3"
              onClick={() => setOpenModal("ny-insats")}
              data-tour="register-case-btn"
            >
              + Registrera insats
            </Button>
            <Button
              variant="outline"
              className="w-full rounded-lg border border-gray-200 text-[var(--tenant-brand)] font-normal text-sm sm:text-base bg-white hover:bg-[var(--tenant-brand-soft)] transition px-3 sm:px-4 lg:px-7 py-2.5 sm:py-3"
              onClick={() => {
                setOpenModal("tid");
                setRegisterTime(rt => ({ ...rt, date: getToday() }));
              }}
              data-tour="register-time-btn"
            >
              + Registrera tid
            </Button>
            <Button
              variant="outline"
              className="w-full rounded-lg border border-gray-200 text-[var(--tenant-brand)] font-normal text-sm sm:text-base bg-white hover:bg-[var(--tenant-brand-soft)] transition px-3 sm:px-4 lg:px-7 py-2.5 sm:py-3"
              onClick={() => setOpenModal("statistik")}
              data-tour="statistics-btn"
            >
              + Ta ut statistik
            </Button>
          </div>
        </div>
        {/* Diagram */}
        <div data-tour="chart-section" className="w-full">
          <BarChartStatistik
            data={chartData}
            titel={`Besöksstatistik (${new Date().toLocaleString('sv-SE', { month: 'long' })})`}
          />
        </div>
      </div>

      {/* Modals - keeping them as they were before */}
      <Modal open={openModal === "kund"} onClose={handleCustomerCancel}>
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-0">
          <div className="bg-[var(--tenant-brand)] rounded-t-2xl px-6 sm:px-8 pt-7 pb-5 flex items-center justify-between">
            <h2 className="text-xl font-light text-white tracking-tight">Lägg till ny kund</h2>
            <button
              type="button"
              onClick={handleCustomerCancel}
              className="text-white hover:bg-[var(--tenant-brand-hover)] rounded-full p-1.5 transition focus:outline-none focus:ring-2 focus:ring-white"
              aria-label="Stäng"
            >
              <X size={24} />
            </button>
          </div>
          <form className="pt-8 pb-10 px-6 sm:px-8 flex flex-col gap-7" style={{borderRadius: '0 0 1rem 1rem'}}>
            <div className="flex flex-col gap-2">
              <label className="text-[var(--tenant-brand)] font-normal text-base">Initialer</label>
              <input
                type="text"
                name="initials"
                placeholder="t.ex. AL"
                value={newCustomer.initials}
                onChange={handleCustomerChange}
                className={`border rounded-lg px-4 py-2 text-base bg-[#fafbfc] focus:outline-none focus:ring-2 ${errors.initials ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-[var(--tenant-brand)]'}`}
              />
              {errors.initials && <span className="text-red-500 text-sm mt-1">{errors.initials}</span>}
            </div>
            <label className="inline-flex items-center gap-2 text-[var(--tenant-brand)] text-base">
              <input
                type="checkbox"
                name="isGroup"
                checked={newCustomer.isGroup}
                onChange={handleCustomerChange}
                className="rounded border-gray-300 text-[var(--tenant-brand)] focus:ring-[var(--tenant-brand)]"
              />
              Registrera som grupp
            </label>
            {!newCustomer.isGroup && (
              <>
                <div className="flex flex-col gap-2">
                  <label className="text-[var(--tenant-brand)] font-normal text-base">Kön</label>
                  <select
                    name="gender"
                    value={newCustomer.gender}
                    onChange={handleCustomerChange}
                    className={`border rounded-lg px-4 py-2 text-base bg-[#fafbfc] focus:outline-none focus:ring-2 ${errors.gender ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-[var(--tenant-brand)]'}`}
                  >
                    <option value="">Välj kön</option>
                    <option value="Flicka">Flicka</option>
                    <option value="Pojke">Pojke</option>
                    <option value="Icke-binär">Icke-binär</option>
                  </select>
                  {errors.gender && <span className="text-red-500 text-sm mt-1">{errors.gender}</span>}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[var(--tenant-brand)] font-normal text-base">Födelseår</label>
                  <input
                    type="text"
                    name="birthYear"
                    placeholder="ÅÅÅÅ"
                    value={newCustomer.birthYear}
                    onChange={handleCustomerChange}
                    className={`border rounded-lg px-4 py-2 text-base bg-[#fafbfc] focus:outline-none focus:ring-2 ${errors.birthYear ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-[var(--tenant-brand)]'}`}
                    maxLength={4}
                  />
                  {errors.birthYear && <span className="text-red-500 text-sm mt-1">{errors.birthYear}</span>}
                </div>
              </>
            )}
            <div className="flex gap-4 justify-center mt-8">
              <button
                type="button"
                onClick={handleCustomerCancel}
                className="px-7 py-3 rounded-full border border-gray-300 text-[var(--tenant-brand)] bg-white font-normal hover:bg-gray-50 transition text-base min-w-[120px]"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={handleCustomerSave}
                className={`px-7 py-3 rounded-full font-normal transition text-base min-w-[160px] ${Object.keys(errors).length > 0 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-[var(--tenant-brand)] text-white hover:bg-[var(--tenant-brand-hover)]'}`}
                disabled={Object.keys(errors).length > 0}
              >
                Spara och fortsätt
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Registrera insats modal */}
      <Modal open={openModal === "ny-insats"} onClose={handleNewCaseCancel}>
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-0">
          <div className="bg-[var(--tenant-brand)] rounded-t-2xl px-6 sm:px-8 pt-7 pb-5 flex items-center justify-between">
            <h2 className="text-xl font-light text-white tracking-tight">Registrera insats</h2>
            <button
              type="button"
              onClick={handleNewCaseCancel}
              className="text-white hover:bg-[var(--tenant-brand-hover)] rounded-full p-1.5 transition focus:outline-none focus:ring-2 focus:ring-white"
              aria-label="Stäng"
            >
              <X size={24} />
            </button>
          </div>
          <form className="pt-8 pb-10 px-6 sm:px-8 flex flex-col gap-7" style={{borderRadius: '0 0 1rem 1rem'}}>
            <div className="flex flex-col gap-2">
              <label className="text-[var(--tenant-brand)] font-normal text-base">Kund</label>
              <KundCombobox 
                value={newCase.customerId} 
                onChange={(value) => handleNewCaseChange('customerId', value)} 
                placeholder="Välj kund" 
              />
              {newCaseErrors.customerId && <span className="text-red-500 text-sm mt-1">{newCaseErrors.customerId}</span>}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[var(--tenant-brand)] font-normal text-base">Insats</label>
              <InsatsCombobox 
                value={newCase.effortId} 
                onChange={(value) => handleNewCaseChange('effortId', value)} 
                placeholder="Välj insats" 
              />
              {newCaseErrors.effortId && <span className="text-red-500 text-sm mt-1">{newCaseErrors.effortId}</span>}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[var(--tenant-brand)] font-normal text-base">Behandlare 1</label>
              <BehandlareCombobox
                value={newCase.handler1Id}
                onChange={(value) => handleNewCaseChange('handler1Id', value)}
              />
              {newCaseErrors.handler1Id && <span className="text-red-500 text-sm mt-1">{newCaseErrors.handler1Id}</span>}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[var(--tenant-brand)] font-normal text-base">Behandlare 2 (valfritt)</label>
              <BehandlareCombobox
                value={newCase.handler2Id}
                onChange={(value) => handleNewCaseChange('handler2Id', value)}
              />
            </div>
            <div className="flex gap-4 justify-center mt-8">
              <button
                type="button"
                onClick={handleNewCaseCancel}
                className="px-7 py-3 rounded-full border border-gray-300 text-[var(--tenant-brand)] bg-white font-normal hover:bg-gray-50 transition text-base min-w-[120px]"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={handleNewCaseSave}
                className={`px-7 py-3 rounded-full font-normal transition text-base min-w-[160px] ${getActualErrorCount(newCaseErrors) > 0 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-[var(--tenant-brand)] text-white hover:bg-[var(--tenant-brand-hover)]'}`}
                disabled={getActualErrorCount(newCaseErrors) > 0}
              >
                Spara och fortsätt
                {getActualErrorCount(newCaseErrors) > 0 && (
                  <span className="ml-2 text-xs">({getActualErrorCount(newCaseErrors)} fel)</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      <Modal open={openModal === "tid"} onClose={handleRegisterTimeCancel}>
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-0">
          <div className="bg-[var(--tenant-brand)] rounded-t-2xl px-6 sm:px-8 pt-7 pb-5 flex items-center justify-between">
            <h2 className="text-xl font-light text-white tracking-tight">Registrera tid för en insats</h2>
            <button
              type="button"
              onClick={handleRegisterTimeCancel}
              className="text-white hover:bg-[var(--tenant-brand-hover)] rounded-full p-1.5 transition focus:outline-none focus:ring-2 focus:ring-white"
              aria-label="Stäng"
            >
              <X size={24} />
            </button>
          </div>
          <form className="pt-8 pb-10 px-6 sm:px-8 flex flex-col gap-7" style={{borderRadius: '0 0 1rem 1rem'}}>
            <div className="flex flex-col gap-2">
              <label className="text-[var(--tenant-brand)] font-normal text-base">Välj insats *</label>
              <Select value={registerTime.customer} onValueChange={value => {
                setRegisterTime(rt => ({ ...rt, customer: value }));
                setRegisterTimeErrors(prev => ({ ...prev, customer: undefined }));
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj insats" />
                </SelectTrigger>
                <SelectContent>
                  {activeCases.map((caseItem) => (
                    <SelectItem key={caseItem.id} value={caseItem.id.toString()}>
                      {caseItem.customer_name} - {caseItem.effort_name} ({caseItem.handler1_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {registerTimeErrors.customer && <span className="text-red-500 text-xs mt-1">{registerTimeErrors.customer}</span>}
            </div>
            <div className="flex gap-4">
              <div className="flex flex-col gap-2 w-1/2">
                <label className="text-[var(--tenant-brand)] font-normal text-base">Datum *</label>
                <input
                  type="date"
                  name="date"
                  value={registerTime.date}
                  onChange={handleRegisterTimeChange}
                  className="border border-gray-200 rounded-lg px-4 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[var(--tenant-brand)] bg-[#fafbfc]"
                />
                {registerTimeErrors.date && <span className="text-red-500 text-xs mt-1">{registerTimeErrors.date}</span>}
              </div>
              <div className="flex flex-col gap-2 w-1/2">
                <label className="text-[var(--tenant-brand)] font-normal text-base">Timmar *</label>
                <input
                  type="number"
                  name="hours"
                  value={registerTime.hours}
                  onChange={handleRegisterTimeChange}
                  className="w-full border rounded px-3 py-2 mt-1"
                  min={0.5}
                  step={0.5}
                  placeholder="Antal timmar"
                />
                {registerTimeErrors.hours && <span className="text-red-500 text-xs mt-1">{registerTimeErrors.hours}</span>}
              </div>
            </div>
            <div className="flex gap-4 justify-center mt-8">
              <button
                type="button"
                onClick={handleRegisterTimeCancel}
                className="px-7 py-3 rounded-full border border-gray-300 text-[var(--tenant-brand)] bg-white font-normal hover:bg-gray-50 transition text-base min-w-[120px]"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={handleRegisterTimeSave}
                className={`px-7 py-3 rounded-full font-normal transition text-base min-w-[160px] ${Object.values(registerTimeErrors).some(Boolean) ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-[var(--tenant-brand)] text-white hover:bg-[var(--tenant-brand-hover)]'}`}
                disabled={Object.values(registerTimeErrors).some(Boolean)}
              >
                Spara tid
              </button>
            </div>
          </form>
        </div>
      </Modal>
      <Modal open={openModal === "statistik"} onClose={handleStatistikCancel}>
        <div
          className={`bg-white rounded-2xl shadow-xl w-full transition-all duration-300 p-6 sm:p-10 lg:p-16 max-w-[calc(100vw-2rem)] ${
            showStatistikChart ? 'sm:max-w-4xl lg:max-w-6xl xl:max-w-7xl' : 'sm:max-w-lg lg:max-w-xl'
          }`}
        >
          <h2 className="text-2xl font-light mb-8">Ta ut statistik</h2>
          <div className={`flex flex-col gap-8 ${showStatistikChart ? 'lg:flex-row lg:gap-12' : ''}`}>
            {/* Vänsterkolumn: Filter */}
            <form
              className={`flex flex-col gap-6 w-full ${showStatistikChart ? 'lg:w-80 lg:max-w-sm' : ''}`}
              onSubmit={handleStatistikApply}
            >
              <div>
                <label className="block text-sm font-medium text-gray-700">Tidsperiod</label>
                <DateRangePicker
                  value={{
                    from: statistik.from ? new Date(statistik.from) : null,
                    to: statistik.to ? new Date(statistik.to) : null
                  }}
                  onChange={(range) => {
                    setStatistik({
                      ...statistik,
                      from: range.from ? range.from.toISOString().slice(0, 10) : '',
                      to: range.to ? range.to.toISOString().slice(0, 10) : ''
                    });
                  }}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Insatskategori</label>
                <MultiSelectCombobox
                  options={[
                    { value: "Behovsprövad", label: "Behovsprövad" },
                    { value: "Förebyggande arbete", label: "Förebyggande arbete" },
                    { value: "Behovsprövad, Förebyggande arbete", label: "Behovsprövad, Förebyggande arbete" },
                    { value: "IUB", label: "IUB" },
                    { value: "Behovsprövad, IUB", label: "Behovsprövad, IUB" }
                  ]}
                  value={statistik.effortCategory}
                  onChange={(values) => setStatistik({ ...statistik, effortCategory: values })}
                  placeholder="Välj insatskategori"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Behandlare</label>
                <MultiSelectCombobox
                  options={handlers?.map(handler => ({ value: handler.id, label: handler.name })) || []}
                  value={statistik.handler}
                  onChange={(values) => setStatistik({ ...statistik, handler: values })}
                  placeholder="Välj behandlare"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Kön</label>
                <MultiSelectCombobox
                  options={[
                    { value: "Pojke", label: "Pojke" },
                    { value: "Flicka", label: "Flicka" },
                    { value: "Icke-binär", label: "Icke-binär" }
                  ]}
                  value={statistik.gender}
                  onChange={(values) => setStatistik({ ...statistik, gender: values })}
                  placeholder="Välj kön"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Insats</label>
                <MultiSelectCombobox
                  options={effortData?.map(effort => ({ value: effort.effort_name, label: effort.effort_name })) || []}
                  value={statistik.effort}
                  onChange={(values) => setStatistik({ ...statistik, effort: values })}
                  placeholder="Välj insats"
                />
              </div>
              <div className="flex gap-4 mt-6">
                <Button variant="outline" type="button" onClick={handleStatistikCancel} className="flex-1 py-3">Avbryt</Button>
                <Button variant="default" type="submit" className="flex-1 py-3 bg-[var(--tenant-brand)] hover:bg-[var(--tenant-brand-hover)]">{showStatistikChart ? 'Applicera filter' : 'Visa diagram'}</Button>
              </div>
            </form>
            {/* Högerkolumn: Diagram och export */}
            {showStatistikChart && (
              <div className="flex-1 flex flex-col gap-8 justify-center items-center" id="statistik-export">
                <div className="w-full flex flex-col items-center">
                  <h3 className="text-xl font-light mb-4 text-center">Besök och kunder / insats</h3>
                  
                  {chartData.length === 0 ? (
                    <div className="w-full h-96 flex flex-col items-center justify-center text-center">
                      <div className="text-gray-400 text-lg mb-4">
                        Ingen data hittades med de valda filtrena.
                      </div>
                      <div className="text-gray-500 text-sm mb-6 max-w-md">
                        Prova att ändra eller ta bort några filter. De valda filtrena verkar vara tomma.
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setStatistik({ 
                              from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
                              to: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10),
                              effortCategory: [], 
                              handler: [], 
                              gender: [], 
                              effort: [] 
                            });
                            setShowStatistikChart(false);
                          }}
                        >
                          Nollställ filter
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => setShowStatistikChart(false)}
                        >
                          Ändra filter
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-full h-80 sm:h-96 flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <RePieChart>
                            <Pie
                              data={chartData}
                              dataKey="besok"
                              nameKey="label"
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={110}
                              fill="var(--tenant-brand)"
                              label={({ label, value }) => `${label}: ${value}`}
                              labelLine={true}
                            >
                              {chartData.map((_entry, index) => (
                                <Cell 
                                  key={`cell-${index}`} 
                                  fill={['var(--tenant-brand)', '#4bbf73', '#e6a100', '#e64a19', '#1769dc', '#b36ae2', '#f59e42', '#6b7280'][index % 8]} 
                                />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend layout="horizontal" verticalAlign="bottom" align="center" />
                          </RePieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-8 w-full">
                        <Button variant="outline" onClick={handleExportPDF} disabled={isExporting} className="flex-1 rounded-lg text-sm font-medium">
                          {isExporting ? 'Exporterar...' : 'Exportera som PDF'}
                        </Button>
                        <Button variant="outline" onClick={handleExportExcel} disabled={isExporting} className="flex-1 rounded-lg text-sm font-medium">
                          {isExporting ? 'Exporterar...' : 'Ladda ner som Excel'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};
