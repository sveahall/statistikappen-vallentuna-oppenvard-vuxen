import { useState, useEffect, useCallback, useRef } from "react";
import { Layout } from "@/components/Layout";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Edit, Loader2, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { getCustomer, updateCustomer, getCustomerEfforts, getShiftsForCase, updateCase, updateShift, addShift, getEfforts, getPublicHandlers, createCase, getCustomerTotalHours } from "@/lib/api";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { useRefresh } from "@/contexts/RefreshContext";
import type { CaseWithNames, ShiftEntry, ShiftStatus, Effort, Customer } from "@/types/types";
import type { HandlerPublic } from "@/lib/api";
import { BehandlareCombobox } from "@/components/ui/behandlare-combobox";
import toast from "react-hot-toast";

type EditableCustomer = {
  initials: string;
  birthYear: string;
  gender: string;
  startDate: string;
  active: boolean;
  isGroup: boolean;
};

export const CustomerProfile = (): JSX.Element => {
  const { id } = useParams();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<EditableCustomer | null>(null);
  const [editCustomerErrors, setEditCustomerErrors] = useState<{ initials?: string; birthYear?: string; gender?: string }>({});
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const [cases, setCases] = useState<CaseWithNames[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [openCaseId, setOpenCaseId] = useState<number | null>(null);
  const [shiftsByCase, setShiftsByCase] = useState<Record<number, ShiftEntry[]>>({});
  // case‑edit modal:
  const [editingCase, setEditingCase] = useState<CaseWithNames | null>(null);
  const [editEffortId, setEditEffortId] = useState<string>("");
  const [editHandler1Id, setEditHandler1Id] = useState<string>("");
  const [editHandler2Id, setEditHandler2Id] = useState<string | null>(null);
  const [editActive, setEditActive] = useState<boolean>(true);
  // shift editing
  const [editingShift, setEditingShift] = useState<{ id: string; date: string; hours: number; status: string } | null>(null);
  const [savingShift, setSavingShift] = useState(false);
  
  // Time registration modal
  const [showTimeRegistration, setShowTimeRegistration] = useState(false);
  const [selectedCaseForTime, setSelectedCaseForTime] = useState<CaseWithNames | null>(null);
  const [newTimeEntry, setNewTimeEntry] = useState({ date: "", hours: 1, status: "Utförd" as ShiftStatus });
  const [savingTime, setSavingTime] = useState(false);
  
  // New case modal
  const [showNewCase, setShowNewCase] = useState(false);
  const [newCase, setNewCase] = useState({ effortId: "", handler1Id: "", handler2Id: "" });
  const [savingCase, setSavingCase] = useState(false);
  const [efforts, setEfforts] = useState<Effort[]>([]);
  const [handlers, setHandlers] = useState<HandlerPublic[]>([]);
  const [pii, setPii] = useState<{ initials: string; gender: string } | null>(null);
  const { user } = useAuth();
  const { refreshKey, triggerRefresh } = useRefresh();
  const [totalHours, setTotalHours] = useState<number | null>(null);
  
  // Toggle för att visa/dölja avslutade insatsen
  const [showClosedCases, setShowClosedCases] = useState(false);
  const autoOpenedRef = useRef(false);

  const handleToggleCase = useCallback(async (c: CaseWithNames) => {
    const isOpen = openCaseId === c.id;
    if (isOpen) {
      setOpenCaseId(null);
      return;
    }
    setOpenCaseId(c.id);
    if (!shiftsByCase[c.id]) {
      try {
        const rows = await getShiftsForCase(c.id.toString());
        setShiftsByCase(prev => ({ ...prev, [c.id]: rows }));
      } catch {
        toast.error("Kunde inte hämta besök");
      }
    }
  }, [openCaseId, shiftsByCase]);


  useEffect(() => {
    if (id) {
      getCustomer(id).then(setCustomer).catch(() => setCustomer(null));
      setLoadingCases(true);
      getCustomerEfforts(Number(id), { includeInactive: true })
        .then((data: CaseWithNames[]) => {
          setCases(data);
        })
        .catch(() => setCases([]))
        .finally(() => setLoadingCases(false));
      
      // Ladda efforts och handlers för tidsregistrering och nya insatser
      Promise.all([getEfforts(), getPublicHandlers()])
        .then(([effortsData, handlersData]) => {
          setEfforts(effortsData);
          setHandlers(handlersData);
        })
        .catch((error) => {
          console.error('CustomerProfile: Error loading efforts/handlers:', error);
          // Ignorera fel för dessa
        });

      getCustomerTotalHours(Number(id))
        .then(hours => setTotalHours(hours))
        .catch(() => setTotalHours(null));
    }
  }, [id, refreshKey]);

  // Öppna rätt insats automatiskt (en gång) via state.openEffort eller ?caseId=
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!cases || !cases.length) return;

    let targetCase: CaseWithNames | undefined;
    let shouldScroll = false;

    const urlParams = new URLSearchParams(location.search);
    const caseId = urlParams.get('caseId');

    if (caseId) {
      targetCase = cases.find(c => c.id.toString() === caseId);
      shouldScroll = true;
    } else if (location.state?.openEffort) {
      targetCase = cases.find(c =>
        c.effort_name === location.state.openEffort ||
        c.effort_id === location.state.openEffort
      );
    }

    if (targetCase) {
      autoOpenedRef.current = true;
      setOpenCaseId(targetCase.id);
      getShiftsForCase(targetCase.id.toString())
        .then(rows => setShiftsByCase(p => ({ ...p, [targetCase!.id]: rows })))
        .catch(() => {});
      if (shouldScroll) {
        setTimeout(() => {
          const element = document.getElementById(`case-${targetCase!.id}`);
          if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases]);

  if (!customer) {
    return <div className="p-8 text-center text-gray-500">Laddar kunddata...</div>;
  }

  const isGroup = Boolean(customer.isGroup ?? customer.is_group);
  const displayInitials = customer.active ? customer.initials : '—';
  const baseTitle = isGroup
    ? `${displayInitials} – Grupp`
    : `${displayInitials} - ${customer.gender ?? '—'} (${customer.birthYear ?? '—'})`;
  const piiTitle = pii
    ? (isGroup ? `${pii.initials} – Grupp` : `${pii.initials} - ${pii.gender ?? customer.gender ?? '—'} (${customer.birthYear ?? '—'})`)
    : null;
  const customerTitle = baseTitle;
  const effectiveTitle = piiTitle ?? customerTitle;

  const handleOpenEdit = () => {
    setEditCustomer({
      initials: customer.initials || "",
      birthYear: customer.birthYear ? String(customer.birthYear) : "",
      gender: isGroup ? '' : (customer.gender || "Flicka"),
      startDate: customer.created_at ? customer.created_at.slice(0, 10) : "",
      active: typeof customer.active === "boolean" ? customer.active : true,
      isGroup,
    });
    setEditCustomerErrors({});
    setEditOpen(true);
  };

  function validateEditCustomer(c: EditableCustomer) {
    const err: { initials?: string; birthYear?: string; gender?: string } = {};
    if (!c.initials) err.initials = "Obligatoriskt fält";
    if (!c.isGroup) {
      if (!c.birthYear) err.birthYear = "Obligatoriskt fält";
      else if (!/^\d{4}$/.test(c.birthYear)) err.birthYear = "Födelseår måste vara 4 siffror";
      if (!c.gender) err.gender = "Obligatoriskt fält";
    }
    return err;
  }

  const handleEditCustomerChange = (field: keyof EditableCustomer, value: string | boolean) => {
    setEditCustomer((prev) => {
      if (!prev) return null;
      let updated: EditableCustomer;
      if (field === 'active') {
        updated = { ...prev, active: value === 'Aktiv' || value === true };
      } else if (field === 'isGroup') {
        const isChecked = value === true || value === 'true';
        updated = {
          ...prev,
          isGroup: isChecked,
          gender: isChecked ? '' : prev.gender,
          birthYear: isChecked ? '' : prev.birthYear,
        };
      } else if (field === 'initials' && typeof value === 'string') {
        updated = { ...prev, [field]: value.toUpperCase() };
      } else {
        updated = { ...prev, [field]: value as string };
      }
      setEditCustomerErrors(validateEditCustomer(updated));
      return updated;
    });
  };

  const handleSaveEdit = async () => {
    if (!editCustomer || !id) return;
    const errors = validateEditCustomer(editCustomer);
    setEditCustomerErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    try {
      await updateCustomer(id, {
        initials: editCustomer.initials,
        gender: editCustomer.isGroup ? undefined : editCustomer.gender,
        birthYear: editCustomer.isGroup ? undefined : Number(editCustomer.birthYear),
        active: editCustomer.active,
        startDate: editCustomer.startDate,
        isGroup: editCustomer.isGroup
      });
      const updated = await getCustomer(id);
      setCustomer(updated);
      setEditOpen(false);
      toast.success("Kund uppdaterad!");
      triggerRefresh();
    } catch (error) {
      toast.error("Kunde inte spara ändringar");
    } finally {
      setSaving(false);
    }
  };

  // Case editing functions
  function openEditCase(c: CaseWithNames) {
    setEditingCase(c);
    setEditEffortId(String(c.effort_id));
    setEditHandler1Id(String(c.handler1_id));
    setEditHandler2Id(c.handler2_id ? String(c.handler2_id) : null);
    setEditActive(Boolean(c.active));
  }

  async function saveCase() {
    if (!editingCase) return;
    try {
      const updated = await updateCase(String(editingCase.id), {
        customer_id: String(editingCase.customer_id),
        effort_id: editEffortId,
        handler1_id: editHandler1Id,
        handler2_id: (editHandler2Id === "" || editHandler2Id === null) ? null : editHandler2Id,
        active: editActive,
      });
      setCases(prev => prev.map(x => x.id === updated.id ? updated : x));
      setEditingCase(null);
      toast.success("Insats uppdaterat!");
      triggerRefresh();
    } catch (e) {
      toast.error("Kunde inte uppdatera insats");
    }
  }

  const handleEditShift = (shift: ShiftEntry) => {
    // Spara det ursprungliga datumet när man redigerar
    
    // Konvertera ISO-datum till YYYY-MM-DD format för HTML date input
    let formattedDate = "";
    if (shift.date) {
      try {
        const date = new Date(shift.date);
        formattedDate = date.toISOString().split('T')[0];
      } catch (e) {
        formattedDate = shift.date;
      }
    }
    
    setEditingShift({
      id: shift.id.toString(),
      date: formattedDate,
      hours: shift.hours,
      status: shift.status
    });
  };

  const handleSaveShift = async () => {
    if (!editingShift) return;
    
    if (!editingShift.date || editingShift.hours <= 0) {
      toast.error("Datum och timmar måste anges");
      return;
    }
    
    setSavingShift(true);
    try {
      await updateShift(editingShift.id, {
        date: editingShift.date,
        hours: editingShift.hours,
        status: editingShift.status
      });
      
      // Uppdatera lokalt state
      setShiftsByCase(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(caseId => {
          newState[Number(caseId)] = newState[Number(caseId)].map(s => 
            s.id.toString() === editingShift.id 
              ? { ...s, date: editingShift.date, hours: editingShift.hours, status: editingShift.status }
              : s
          );
        });
        return newState;
      });
      
      setEditingShift(null);
      toast.success("Uppdaterat!");
      triggerRefresh();
    } catch {
      toast.error("Kunde inte spara ändringar");
    } finally {
      setSavingShift(false);
    }
  };

  // Time registration functions
  const openTimeRegistration = (caseItem: CaseWithNames) => {
    setSelectedCaseForTime(caseItem);
    setNewTimeEntry({ 
      date: new Date().toISOString().split('T')[0], 
      hours: 1, 
      status: "Utförd" 
    });
    setShowTimeRegistration(true);
  };

  const saveTimeEntry = async () => {
    if (!selectedCaseForTime || !newTimeEntry.date || newTimeEntry.hours <= 0) {
      toast.error("Fyll i alla obligatoriska fält");
      return;
    }

    setSavingTime(true);
    try {
      const newShift = await addShift({
        case_id: selectedCaseForTime.id,
        date: newTimeEntry.date,
        hours: newTimeEntry.hours,
        status: newTimeEntry.status
      });

      // Uppdatera lokalt state
      setShiftsByCase(prev => ({
        ...prev,
        [selectedCaseForTime.id]: [...(prev[selectedCaseForTime.id] || []), newShift]
      }));

      setShowTimeRegistration(false);
      setSelectedCaseForTime(null);
      toast.success("Tid registrerad!");
      triggerRefresh();
    } catch (error) {
      toast.error("Kunde inte registrera tid");
    } finally {
      setSavingTime(false);
    }
  };

  // New case functions
  const openNewCase = () => {
    setNewCase({ effortId: "", handler1Id: "", handler2Id: "" });
    setShowNewCase(true);
  };

  const saveNewCase = async () => {
    if (!newCase.effortId || !newCase.handler1Id || !id) {
      toast.error("Fyll i alla obligatoriska fält");
      return;
    }

    setSavingCase(true);
    try {
      const newCaseData = await createCase({
        customer_id: Number(id),
        effort_id: Number(newCase.effortId),
        handler1_id: Number(newCase.handler1Id),
        handler2_id: newCase.handler2Id ? Number(newCase.handler2Id) : null,
        active: true
      });

      // Uppdatera lokalt state
      setCases(prev => [...prev, newCaseData]);
      setShowNewCase(false);
      toast.success("Ny insats skapad!");
      triggerRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes('samma kombination finns redan')) {
        toast.error('En aktiv insats med samma kombination finns redan för denna kund.');
      } else {
        toast.error("Kunde inte skapa insats");
      }
    } finally {
      setSavingCase(false);
    }
  };

  // Återuppta avslutat insats
  const reactivateCase = async (caseItem: CaseWithNames) => {
    try {
      const updated = await updateCase(String(caseItem.id), {
        customer_id: String(caseItem.customer_id),
        effort_id: String(caseItem.effort_id),
        handler1_id: String(caseItem.handler1_id),
        handler2_id: caseItem.handler2_id ? String(caseItem.handler2_id) : null,
        active: true
      });
      
      // Uppdatera lokalt state - behåll alla namn-fält från det ursprungliga objektet
      setCases(prev => prev.map(x => x.id === updated.id ? {
        ...x,  // Behåll alla ursprungliga fält inklusive namn
        active: true  // Uppdatera bara active-status
      } : x));
      toast.success("Insats återupptaget!");
      triggerRefresh();
    } catch (error) {
      toast.error("Kunde inte återuppta insats");
    }
  };

  if (!customer) {
    return <div className="p-8 text-center text-gray-500">Laddar kunddata...</div>;
  }

  return (
    <Layout title="Kundprofil">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate('/kunder')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-4xl font-light text-[#333] float-left flex ml-0">{effectiveTitle}</h1>
          </div>
          <div className="flex gap-3 items-center float-right h-full">
          <Badge variant={customer.active ? "default" : "destructive"}>{customer.active ? "Aktiv" : "Avslutad"}</Badge>
          {customer.is_protected && (
            <Badge className="bg-purple-100 text-purple-800 border border-purple-300 whitespace-nowrap">Skyddad identitet</Badge>
          )}
          {customer.is_protected && user?.role === 'admin' && (
            <Button
              variant="outline"
              size="sm"
              className="ml-2"
              onClick={async () => {
                if (pii) {
                  setPii(null);
                  return;
                }
                try {
                  const res = await api(`/customers/${customer.id}/pii`);
                  if (!res.ok) throw new Error('Åtkomst nekad');
                  const data = await res.json();
                  setPii({ initials: data.initials, gender: data.gender });
                } catch (e) {
                  // tyst fel
                }
              }}
            >
              {pii ? (
                <>
                  <EyeOff className="w-4 h-4 mr-1" /> Göm uppgifter
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-1" /> Visa kunds uppgifter
                </>
              )}
            </Button>
          )}
        <Button variant="outline" className="gap-2" onClick={handleOpenEdit}>
          <Edit className="w-4 h-4" /> Redigera kund
        </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Vänsterkolumn: kunduppgifter */}
        <div className="lg:col-span-1 flex flex-col gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Kunduppgifter</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Kund-ID</span>
                <span className="font-medium text-gray-800">{customer.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Initialer</span>
                <span className="font-medium text-gray-800">{customer.initials}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Typ</span>
                <span className="font-medium text-gray-800">{isGroup ? 'Grupp' : 'Individ'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Födelseår</span>
                <span className="font-medium text-gray-800">{isGroup ? '—' : (customer.birthYear ?? '—')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Kön</span>
                <span className="font-medium text-gray-800">{isGroup ? '—' : (customer.gender ?? '—')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Startdatum</span>
                <span className="font-medium text-gray-800">{customer.created_at?.slice(0, 10)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Totala besökstimmar</span>
                <span className="font-medium text-gray-800">{totalHours != null ? `${totalHours.toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} h` : '—'}</span>
              </div>
            </CardContent>
          </Card>
        </div>
        {/* Högerkolumn: insatser */}
        <div className="lg:col-span-2 flex flex-col gap-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Insatser</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openNewCase}
                  className="bg-green-50 hover:bg-green-100 text-green-700 border-green-300"
                >
                  + Lägg till insats för kund
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Toggle för att visa/dölja avslutade insatsen */}

              {cases.some(c => !c.active) && (
                <div className="flex justify-end mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowClosedCases(!showClosedCases)}
                    className="text-gray-600 hover:text-gray-800"
                  >
                    {showClosedCases ? "Dölj avslutade insatser" : "Visa avslutade insatser"}
                  </Button>
                </div>
              )}
              
              {loadingCases ? (
                <div className="text-gray-500 text-center py-8">Laddar insatser...</div>
              ) : cases.length === 0 ? (
                <div className="text-gray-500 text-center py-8">Inga insatser registrerade för denna kund ännu.</div>
              ) : (
                cases
                  .filter(caseItem => caseItem.active || showClosedCases) // Visa aktiva + avslutade om toggle är på
                  .map((caseItem, idx) => (
                  <Card key={idx} id={`case-${caseItem.id}`} className="bg-gray-50 hover:bg-green-50 transition">
                    <CardContent className="p-4 flex flex-col gap-2 relative">
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-lg text-[var(--tenant-brand)]">{caseItem.effort_name}</div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full px-4 py-1 text-xs font-medium shadow-sm border-gray-300 hover:bg-[var(--tenant-brand-soft)] transition"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditCase(caseItem);
                            }}
                          >
                            Redigera insats
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full px-4 py-1 text-xs font-medium shadow-sm border-gray-300 hover:bg-[var(--tenant-brand-soft)] transition"
                            onClick={() => handleToggleCase(caseItem)}
                          >
                            {openCaseId === caseItem.id ? "Dölj besök" : "Visa besök"}
                          </Button>
                        </div>
                      </div>
                      <div className="text-sm text-gray-600 mb-2">
                        Behandlare: {caseItem.handler1_name}{caseItem.handler2_name ? ' & ' + caseItem.handler2_name : ''}
                        <span className={`ml-2 inline-block text-xs px-2 py-0.5 rounded ${caseItem.active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                          {caseItem.active ? "Pågående" : "Avslutad"}
                        </span>
                        {caseItem.created_at && (
                          <span className="ml-2 text-xs text-gray-500">
                            Start: {new Date(caseItem.created_at).toLocaleDateString('sv-SE')}
                          </span>
                        )}
                      </div>
                      
                      {/* Visa shifts om insatsen är öppen */}
                      {openCaseId === caseItem.id && (
                        <div className="mt-4 border-t pt-4">
                          {(shiftsByCase[caseItem.id] ?? []).length === 0 ? (
                            <div className="text-gray-400 text-sm">Inga registrerade besök.</div>
                          ) : (
                            <div className="space-y-2">
                              {(shiftsByCase[caseItem.id] ?? []).map(s => (
                                <div key={s.id} className="bg-white p-3 rounded border">
                                  {editingShift?.id === s.id.toString() ? (
                                    <div className="space-y-2">
                                      <div className="grid grid-cols-3 gap-2">
                                        <input
                                          type="date"
                                          className="border rounded px-2 py-1 text-sm"
                                          value={editingShift.date}
                                          onChange={(e) => setEditingShift({...editingShift, date: e.target.value})}
                                        />

                                        <input
                                          type="number"
                                          min="0.25"
                                          step="0.25"
                                          className="border rounded px-2 py-1 text-sm"
                                          value={editingShift.hours}
                                          onChange={(e) => setEditingShift({...editingShift, hours: Number(e.target.value)})}
                                        />
                                        <select
                                          className="border rounded px-2 py-1 text-sm"
                                          value={editingShift.status}
                                          onChange={(e) => setEditingShift({...editingShift, status: e.target.value as ShiftStatus})}
                                        >
                                          <option value="Utförd">Utförd</option>
                                          <option value="Avbokad">Avbokad</option>
                                        </select>
                                      </div>
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          onClick={handleSaveShift}
                                          disabled={savingShift}
                                          className="text-xs"
                                        >
                                          {savingShift ? 'Sparar...' : 'Spara'}
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => setEditingShift(null)}
                                          className="text-xs"
                                        >
                                          Avbryt
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-4 gap-4 items-center">
                                      <div className="text-sm">{s.date?.slice(0, 10) || '-'}</div>
                                      <div className="text-sm">{s.hours}h</div>
                                      <div className="text-sm">{s.status}</div>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleEditShift(s);
                                        }}
                                        className="text-xs"
                                      >
                                        Redigera
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="flex gap-2 justify-end mt-2">
                        {/* Visa "Registrera tid" för aktiva insatsen */}
                        {caseItem.active && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full px-4 py-1 text-xs font-medium shadow-sm border-gray-300 hover:bg-[var(--tenant-brand-soft)] transition"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTimeRegistration(caseItem);
                            }}
                          >
                            Registrera tid
                          </Button>
                        )}
                        
                        {/* Visa "Återuppta insats" för avslutade insatsen */}
                        {!caseItem.active && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full px-4 py-1 text-xs font-medium shadow-sm border-blue-300 hover:bg-blue-50 text-blue-700 transition"
                            onClick={(e) => {
                              e.stopPropagation();
                              reactivateCase(caseItem);
                            }}
                          >
                            Återuppta insats
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Modal för Redigera kund */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)}>
        <div className="w-full max-w-lg p-6 sm:p-8 bg-white rounded-2xl shadow-lg">
          <h2 className="text-xl font-semibold mb-4">Redigera kund</h2>
          {(editCustomer !== null) ? (
            <div className="flex flex-col gap-4">
              <label className="text-sm font-medium text-gray-700">Initialer</label>
              <input
                type="text"
                className={`border rounded px-3 py-2 ${editCustomerErrors.initials ? 'border-red-500' : ''}`}
                value={editCustomer.initials}
                onChange={e => handleEditCustomerChange('initials', e.target.value)}
                placeholder="Initialer"
              />
              {editCustomerErrors.initials && <span className="text-red-500 text-xs mt-1">{editCustomerErrors.initials}</span>}
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={!!editCustomer.isGroup}
                  onChange={e => handleEditCustomerChange('isGroup', e.target.checked)}
                />
                Markera som grupp
              </label>
              {!editCustomer.isGroup && (
                <>
                  <label className="text-sm font-medium text-gray-700">Födelseår</label>
                  <input
                    type="text"
                    className={`border rounded px-3 py-2 ${editCustomerErrors.birthYear ? 'border-red-500' : ''}`}
                    value={editCustomer.birthYear}
                    onChange={e => handleEditCustomerChange('birthYear', e.target.value)}
                    placeholder="Födelseår"
                  />
                  {editCustomerErrors.birthYear && <span className="text-red-500 text-xs mt-1">{editCustomerErrors.birthYear}</span>}
                  <label className="text-sm font-medium text-gray-700">Kön</label>
                  <select
                    className={`border rounded px-3 py-2 ${editCustomerErrors.gender ? 'border-red-500' : ''}`}
                    value={editCustomer.gender}
                    onChange={e => handleEditCustomerChange('gender', e.target.value)}
                  >
                    <option value="Flicka">Flicka</option>
                    <option value="Pojke">Pojke</option>
                    <option value="Icke-binär">Icke-binär</option>
                  </select>
                  {editCustomerErrors.gender && <span className="text-red-500 text-xs mt-1">{editCustomerErrors.gender}</span>}
                </>
              )}
              <label className="text-sm font-medium text-gray-700">Startdatum</label>
              <input
                type="date"
                className="border rounded px-3 py-2"
                value={editCustomer.startDate}
                onChange={e => handleEditCustomerChange('startDate', e.target.value)}
                placeholder="Startdatum"
              />
              <label className="text-sm font-medium text-gray-700">Status</label>
              <select
                className="border rounded px-3 py-2"
                value={editCustomer.active ? "Aktiv" : "Avslutad"}
                onChange={e => handleEditCustomerChange('active', e.target.value)}
              >
                <option value="Aktiv">Aktiv</option>
                <option value="Avslutad">Avslutad</option>
              </select>
            </div>
          ) : (
            <div className="text-gray-500">Laddar formulär...</div>
          )}
          <div className="flex gap-4 justify-end mt-6">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Avbryt</Button>
            <Button variant="default" onClick={handleSaveEdit} disabled={saving || !editCustomer || Object.keys(editCustomerErrors).length > 0}>
              {saving ? <><Loader2 className="animate-spin w-5 h-5 mr-2 inline"/>Sparar...</> : "Spara"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal för Redigera insats */}
      <Modal open={!!editingCase} onClose={() => setEditingCase(null)}>
        <div className="w-full max-w-lg p-6 sm:p-8 bg-white rounded-2xl shadow-lg">
          <h2 className="text-xl font-semibold mb-6">Redigera insats</h2>
          {editingCase && (
            <div className="flex flex-col gap-5">
              {/* Info-sektion */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Insats</span>
                  <span className="text-sm font-medium text-gray-800">{editingCase.effort_name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Startdatum</span>
                  <span className="text-sm font-medium text-gray-800">
                    {editingCase.created_at ? new Date(editingCase.created_at).toLocaleDateString('sv-SE') : 'Ej tillgängligt'}
                  </span>
                </div>
              </div>

              {/* Redigerbara fält */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Behandlare 1</label>
                <BehandlareCombobox
                  value={editHandler1Id}
                  onChange={value => setEditHandler1Id(value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Behandlare 2 (valfritt)</label>
                <BehandlareCombobox
                  value={editHandler2Id || ""}
                  onChange={value => setEditHandler2Id(value ? value : null)}
                />
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer select-none mt-1">
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={e => setEditActive(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-[var(--tenant-brand)] focus:ring-[var(--tenant-brand)]"
                />
                Aktiv insats
              </label>
            </div>
          )}
          <div className="flex gap-3 justify-end mt-8 pt-5 border-t">
            <Button variant="outline" onClick={() => setEditingCase(null)}>Avbryt</Button>
            <Button variant="default" onClick={saveCase}>
              Spara
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal för Registrera tid */}
      <Modal open={showTimeRegistration} onClose={() => setShowTimeRegistration(false)}>
        <div className="w-full max-w-lg p-6 sm:p-8 bg-white rounded-2xl shadow-lg">
          <h2 className="text-xl font-semibold mb-4">Registrera tid</h2>
          {selectedCaseForTime && (
            <div className="flex flex-col gap-4">
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-sm text-gray-600">Kund: {customer.initials}</div>
                <div className="text-sm text-gray-600">Insats: {selectedCaseForTime.effort_name}</div>
                <div className="text-sm text-gray-600">Behandlare: {selectedCaseForTime.handler1_name}</div>
              </div>
              
              <label className="text-sm font-medium text-gray-700">Datum *</label>
              <input
                type="date"
                className="border rounded px-3 py-2"
                value={newTimeEntry.date}
                onChange={(e) => setNewTimeEntry({...newTimeEntry, date: e.target.value})}
              />
              
              <label className="text-sm font-medium text-gray-700">Timmar *</label>
              <input
                type="number"
                min="0.25"
                step="0.25"
                className="border rounded px-3 py-2"
                value={newTimeEntry.hours}
                onChange={(e) => setNewTimeEntry({...newTimeEntry, hours: Number(e.target.value)})}
                placeholder="1"
              />
              
              <label className="text-sm font-medium text-gray-700">Status</label>
              <select
                className="border rounded px-3 py-2"
                value={newTimeEntry.status}
                onChange={(e) => setNewTimeEntry({...newTimeEntry, status: e.target.value as ShiftStatus})}
              >
                <option value="Utförd">Utförd</option>
                <option value="Avbokad">Avbokad</option>
              </select>
            </div>
          )}
          <div className="flex gap-4 justify-end mt-6">
            <Button variant="outline" onClick={() => setShowTimeRegistration(false)} disabled={savingTime}>
              Avbryt
            </Button>
            <Button 
              variant="default" 
              onClick={saveTimeEntry} 
              disabled={savingTime || !newTimeEntry.date || newTimeEntry.hours <= 0}
            >
              {savingTime ? <><Loader2 className="animate-spin w-5 h-5 mr-2 inline"/>Sparar...</> : "Spara"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal för Skapa nytt insats */}
      <Modal open={showNewCase} onClose={() => setShowNewCase(false)}>
        <div className="w-full max-w-lg p-6 sm:p-8 bg-white rounded-2xl shadow-lg">
          <h2 className="text-xl font-semibold mb-4">Skapa ny insats</h2>
          <div className="flex flex-col gap-4">
            <div className="bg-gray-50 p-3 rounded">
              <div className="text-sm text-gray-600">Kund: {customer.initials}</div>
            </div>
            
            <label className="text-sm font-medium text-gray-700">Insats *</label>
            <select
              className="border rounded px-3 py-2"
              value={newCase.effortId}
              onChange={(e) => setNewCase({...newCase, effortId: e.target.value})}
            >
              <option value="">Välj insats</option>
              {efforts.map((effort) => (
                <option key={effort.id} value={effort.id.toString()}>
                  {effort.name}
                </option>
              ))}
            </select>
            
            <label className="text-sm font-medium text-gray-700">Behandlare 1 *</label>
            <select
              className="border rounded px-3 py-2"
              value={newCase.handler1Id}
              onChange={(e) => setNewCase({...newCase, handler1Id: e.target.value})}
            >
              <option value="">Välj behandlare</option>
              {handlers.map((handler) => (
                <option key={handler.id} value={handler.id.toString()}>
                  {handler.name}
                </option>
              ))}
            </select>
            
            <label className="text-sm font-medium text-gray-700">Behandlare 2 (valfritt)</label>
            <select
              className="border rounded px-3 py-2"
              value={newCase.handler2Id}
              onChange={(e) => setNewCase({...newCase, handler2Id: e.target.value})}
            >
              <option value="">Ingen</option>
              {handlers.map((handler) => (
                <option key={handler.id} value={handler.id.toString()}>
                  {handler.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-4 justify-end mt-6">
            <Button variant="outline" onClick={() => setShowNewCase(false)} disabled={savingCase}>
              Avbryt
            </Button>
            <Button 
              variant="default" 
              onClick={saveNewCase} 
              disabled={savingCase || !newCase.effortId || !newCase.handler1Id}
            >
              {savingCase ? <><Loader2 className="animate-spin w-5 h-5 mr-2 inline"/>Skapar...</> : "Skapa insats"}
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
};
