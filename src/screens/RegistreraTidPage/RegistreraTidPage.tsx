import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRefresh } from "@/contexts/RefreshContext";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Save, FileText, Clock, CheckCircle } from "lucide-react";
import { addShift, getShifts, getCases, getEfforts, getHandlers, getPublicHandlers, createCase, updateShift } from "@/lib/api";
import { KundCombobox } from "@/components/ui/kund-combobox";
import { CaseCombobox } from "@/components/ui/case-combobox";
import { ShiftEntry, CaseWithNames, Effort, Handler } from "@/types/types";
import { HandlerPublic } from "@/lib/api";
import { LoadingSpinner, Skeleton } from "@/components/ui/loading-spinner";
import { enhancedToast } from "@/components/ui/enhanced-toast";
import { validateForm, schemas } from "@/lib/validation";
import { useFocusTrap } from "@/lib/keyboard-navigation";

// Hjälpfunktion för att få dagens datum
function today(): string {
  return new Date().toISOString().split('T')[0];
}

interface TimeEntry {
  id: string;
  caseId: number | null;
  date: string;
  hours: number;
  status: "Utförd" | "Avbokad";
}

type NamedError = { name?: string };
const hasNameProperty = (error: unknown): error is NamedError =>
  typeof error === 'object' && error !== null && 'name' in error;

const isAbortError = (error: unknown): boolean =>
  hasNameProperty(error) && error.name === 'AbortError';

type ApiErrorPayload = { error?: unknown };
const extractServerError = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'error' in error) {
    const payload = error as ApiErrorPayload;
    return typeof payload.error === 'string' ? payload.error : '';
  }
  return '';
};

export const RegisteraTidPage = (): JSX.Element => {
  const { user } = useAuth();
  const { refreshKey, triggerRefresh } = useRefresh();
  
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([
    {
      id: "1",
      caseId: null,
      date: today(),
      hours: 1,
      status: "Utförd"
    }
  ]);
  
  const [activeCases, setActiveCases] = useState<CaseWithNames[]>([]);
  const [efforts, setEfforts] = useState<Effort[]>([]);
  const [handlers, setHandlers] = useState<Handler[] | HandlerPublic[]>([]);
  const [shifts, setShifts] = useState<ShiftEntry[]>([]);
  const [showOnlyMyCases, setShowOnlyMyCases] = useState(user?.role !== 'admin');
  
  // Loading states
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isLoadingCases, setIsLoadingCases] = useState(false);
  
  // State för att registrera insats
  const [showCreateCase, setShowCreateCase] = useState(false);
  const [newCaseCustomerId, setNewCaseCustomerId] = useState<string>("");
  const [newCaseEffortId, setNewCaseEffortId] = useState<string>("");
  const [newCaseHandler1Id, setNewCaseHandler1Id] = useState<string>("");
  const [newCaseHandler2Id, setNewCaseHandler2Id] = useState<string>("");

  // State för att spara
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // State för att redigera befintlig tidsregistrering
  const [editingShift, setEditingShift] = useState<ShiftEntry | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  
  // Focus trap för modal
  const modalFocusTrapRef = useFocusTrap(showEditModal);
  
  // Spara alla tidsregistreringar
  const saveAllEntries = useCallback(async () => {
    // Validera alla tidsregistreringar med Zod
    const validationResults = timeEntries.map(entry => ({
      entry,
      validation: validateForm(schemas.timeEntry, {
        caseId: entry.caseId,
        date: entry.date,
        hours: entry.hours,
        status: entry.status
      })
    }));

    const validEntries = validationResults
      .filter(result => result.validation.success)
      .map(result => result.entry);

    if (validEntries.length === 0) {
      enhancedToast.error("Inga giltiga tidsregistreringar att spara");
      return;
    }

    const invalidEntries = validationResults.filter(result => !result.validation.success);
    if (invalidEntries.length > 0) {
      const errorMessages = invalidEntries
        .map(result => 'validation' in result && !result.validation.success ? result.validation.errors.join(', ') : 'Okänt fel')
        .join('; ');
      enhancedToast.error(`Valideringsfel: ${errorMessages}`);
      return;
    }

    setIsSaving(true);
    try {
      const operations = validEntries.map(entry =>
        addShift({
          case_id: entry.caseId!,
          date: entry.date,
          hours: entry.hours,
          status: entry.status
        })
      );

      const outcomes = await Promise.allSettled(operations);
      const succeeded = outcomes.filter(result => result.status === 'fulfilled').length;
      const failed = outcomes
        .map((result, idx) => result.status === 'rejected' ? { entry: validEntries[idx], reason: result.reason } : null)
        .filter((item): item is { entry: TimeEntry; reason: unknown } => Boolean(item));

      if (succeeded > 0) {
        enhancedToast.success(`${succeeded} tidsregistrering${succeeded > 1 ? 'ar' : ''} sparades!`, {
          icon: '✅',
          duration: 4000
        });

        try {
          const updatedShifts = await getShifts();
          setShifts(updatedShifts);
        } catch (error) {
          console.error("Kunde inte ladda om tidsregistreringar:", error);
          enhancedToast.error("Tidsregistreringar sparades men kunde inte ladda om listan");
        }

        setTimeEntries([{
          id: "1",
          caseId: null,
          date: today(),
          hours: 1,
          status: "Utförd"
        }]);
        setHasUnsavedChanges(false);
        triggerRefresh();
      }

      if (failed.length > 0) {
        const firstError = failed[0].reason instanceof Error
          ? failed[0].reason.message
          : 'Okänt fel vid sparande';
        enhancedToast.error(`Det gick inte att spara ${failed.length} rad(er): ${firstError}`);
      }
    } catch (error) {
      console.error("Error saving shifts:", error);
      enhancedToast.error("Kunde inte spara tidsregistreringarna. Kontrollera din internetanslutning och försök igen.", {
        duration: 5000
      });
    } finally {
      setIsSaving(false);
    }
  }, [timeEntries, triggerRefresh]);

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+S för att spara
      if (event.ctrlKey && event.key === 's') {
        event.preventDefault();
        if (hasUnsavedChanges) {
          saveAllEntries();
        }
      }
      
      // Escape för att stänga modal
      if (event.key === 'Escape' && showEditModal) {
        setShowEditModal(false);
        setEditingShift(null);
      }
      
      // Escape för att stänga insatsskapande
      if (event.key === 'Escape' && showCreateCase) {
        setShowCreateCase(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hasUnsavedChanges, showEditModal, showCreateCase, saveAllEntries]);

  // Synka standardfilter när användarrollen laddas
  useEffect(() => {
    setShowOnlyMyCases(user?.role !== 'admin');
  }, [user?.role]);

  // Ladda data vid mount
  const loadInitialData = useCallback(async () => {
    setIsLoadingData(true);
    setDataError(null);
    try {
      const [activeCasesData, effortsData, handlersData, shiftsData] = await Promise.all([
        getCases(false),
        getEfforts(),
        user?.role === 'admin' ? getHandlers(true) : getPublicHandlers(),
        getShifts()
      ]);
      setActiveCases(activeCasesData);
      setEfforts(effortsData);
      setHandlers(handlersData);
      setShifts(shiftsData);
    } catch (error) {
      if (!isAbortError(error)) {
        console.error("Error loading data:", error);
        setDataError('Kunde inte ladda data. Kontrollera anslutning och försök igen.');
        enhancedToast.error("Kunde inte ladda data.");
      }
    } finally {
      setIsLoadingData(false);
    }
  }, [user?.role]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData, refreshKey]);

  const filteredCases = useMemo(() => {
    if (!user) return activeCases;
    if (!showOnlyMyCases) return activeCases;
    return activeCases.filter(c => c.handler1_id === user.id || c.handler2_id === user.id);
  }, [activeCases, showOnlyMyCases, user]);
  


  // Lägg till ny tidsregistrering
  const addTimeEntry = () => {
    const newEntry: TimeEntry = {
      id: Date.now().toString(),
      caseId: null,
      date: today(),
      hours: 1,
      status: "Utförd"
    };
    setTimeEntries([...timeEntries, newEntry]);
    setHasUnsavedChanges(true);
  };

  // Ta bort tidsregistrering
  const removeTimeEntry = (id: string) => {
    if (timeEntries.length > 1) {
      setTimeEntries(timeEntries.filter(entry => entry.id !== id));
      setHasUnsavedChanges(true);
    }
  };

  // Uppdatera tidsregistrering
  const updateTimeEntry = <K extends keyof TimeEntry>(id: string, field: K, value: TimeEntry[K]) => {
    setTimeEntries(prev => prev.map(entry => 
      entry.id === id ? { ...entry, [field]: value } : entry
    ));
    setHasUnsavedChanges(true);
  };

  // Registrera insats
  const handleCreateCase = async () => {
    // Validera formuläret med Zod
    const formData = {
      customer_id: Number(newCaseCustomerId),
      effort_id: Number(newCaseEffortId),
      handler1_id: Number(newCaseHandler1Id),
      handler2_id: newCaseHandler2Id && newCaseHandler2Id !== "none" ? Number(newCaseHandler2Id) : null,
      active: true
    };

    const validation = validateForm(schemas.case, formData);
    if (!validation.success) {
      enhancedToast.error(`Valideringsfel: ${validation.errors.join(', ')}`);
      return;
    }

    setIsLoadingCases(true);
    try {
      const newCase = await createCase({
        customer_id: Number(newCaseCustomerId),
        effort_id: Number(newCaseEffortId),
        handler1_id: Number(newCaseHandler1Id),
        handler2_id: newCaseHandler2Id && newCaseHandler2Id !== "none" ? Number(newCaseHandler2Id) : null,
        active: true
      });
      
      // Uppdatera aktiva insatsen
      setActiveCases(prev => [newCase, ...prev]);
      setShowCreateCase(false);
      
      // Återställ formuläret
      setNewCaseCustomerId("");
      setNewCaseEffortId("");
      setNewCaseHandler1Id("");
      setNewCaseHandler2Id("none");
      
      enhancedToast.success("Insats registrerad");
      triggerRefresh();
    } catch (error) {
      const serverMessage = extractServerError(error);
      const fallbackMessage = error instanceof Error ? error.message : '';
      if (serverMessage.includes('samma kombination finns redan')) {
        enhancedToast.error(serverMessage, { duration: 8000 }); // 8 sekunder
      } else if (fallbackMessage.includes('samma kombination finns redan')) {
        enhancedToast.error('En aktiv insats med samma kombination finns redan för denna kund. Du kan inte skapa flera identiska insatser.', { duration: 8000 }); // 8 sekunder
      } else {
        enhancedToast.error("Kunde inte skapa insats. Kontrollera din internetanslutning och försök igen.");
      }
    } finally {
      setIsLoadingCases(false);
    }
  };

  // Kontrollera om det finns osparade ändringar
  const getUnsavedCount = () => {
    return timeEntries.filter(entry => entry.caseId && entry.date && entry.hours > 0).length;
  };

  // Hantera klick på tidsregistrering
  const handleShiftClick = (shift: ShiftEntry) => {
    setEditingShift(shift);
    setShowEditModal(true);
  };

  // Spara redigerad tidsregistrering
  const handleSaveEditedShift = async () => {
    if (!editingShift) return;

    const hours = Number(editingShift.hours);
    if (!editingShift.date || !/^\d{4}-\d{2}-\d{2}$/.test(editingShift.date)) {
      enhancedToast.error("Ogiltigt datum");
      return;
    }
    if (isNaN(hours) || hours <= 0 || hours > 24) {
      enhancedToast.error("Timmar måste vara mellan 0 och 24");
      return;
    }

    try {
      const updatedShift = await updateShift(editingShift.id.toString(), {
        date: editingShift.date,
        hours,
        status: editingShift.status
      });
      
      // Uppdatera listan
      setShifts(prev => prev.map(s => s.id === editingShift.id ? updatedShift : s));
      
      setShowEditModal(false);
      setEditingShift(null);
      enhancedToast.success("Tidsregistrering uppdaterad!");
      triggerRefresh();
    } catch (error) {
      enhancedToast.error("Kunde inte uppdatera tidsregistrering");
    }
  };

  return (
    <Layout title="Registrera tid">
      <div className="w-full flex flex-col gap-6 lg:gap-8 py-4 min-w-0">
      {dataError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>{dataError}</span>
          <Button variant="outline" size="sm" onClick={loadInitialData} disabled={isLoadingData}>
            {isLoadingData ? 'Laddar...' : 'Försök igen'}
          </Button>
        </div>
      )}
      {/* Tidsregistreringar - nu först eftersom det är huvudsyftet */}
      <Card className="flex-1 bg-white rounded-xl" data-tour="time-section">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <Clock className="w-4 h-4 text-white" />
              </div>
              <span>Tidsregistreringar</span>
            </div>
            {hasUnsavedChanges && (
              <span className="text-sm text-orange-600 bg-orange-100 px-2 py-1 rounded-full mobile:hidden">
                {getUnsavedCount()} rad(er) redo att sparas
              </span>
            )}
          </CardTitle>
          <p className="mb-2 text-sm max-w-xl">
                Här kan du registrera tider för befintliga aktiva insatser. 
                Välj insats, datum, timmar och status. Registrera en ny insats nedan om du inte hittar insatsen i listan.
          </p>
        </CardHeader>
        <CardContent className="mobile:p-6">
          {isLoadingData ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <>
              {/* Tidsregistreringar */}
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 mb-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-[var(--tenant-brand)] focus:ring-[var(--tenant-brand)]"
                    checked={showOnlyMyCases}
                    onChange={e => setShowOnlyMyCases(e.target.checked)}
                  />
                  Visa endast mina insatser
                </label>
                <span className="text-xs text-gray-500">
                  Visar {filteredCases.length} insatser
                </span>
              </div>
              <div className="space-y-1 mobile:space-y-2">
                {timeEntries.map((entry) => {
                  const selectedCase = entry.caseId ? activeCases.find(c => c.id === entry.caseId) : undefined;
                  const casesForCombobox = selectedCase && !filteredCases.some(c => c.id === selectedCase.id)
                    ? [selectedCase, ...filteredCases]
                    : filteredCases;

                  return (
                  <div key={entry.id} className="flex flex-col gap-2 bg-white rounded-lg md:grid md:grid-cols-12 md:items-end">
                    <div className="space-y-2 md:col-span-4" data-tour="time-case-select">
                      <Label className="text-sm font-medium text-gray-700">Insats *</Label>
                      <CaseCombobox
                        cases={casesForCombobox}
                        value={entry.caseId}
                        onChange={(value) => updateTimeEntry(entry.id, 'caseId', value)}
                        placeholder="Sök efter insats"
                      />
                    </div>
                    
                    <div className="space-y-2 md:col-span-3" data-tour="time-date-input">
                      <Label className="text-sm font-medium text-gray-700">Datum *</Label>
                      <Input
                        type="date"
                        value={entry.date}
                        onChange={(e) => updateTimeEntry(entry.id, 'date', e.target.value)}
                        className="border-gray-300 focus:border-blue-600 focus:ring-blue-600 w-full h-10"
                      />
                    </div>
                    
                    <div className="space-y-2 md:col-span-2" data-tour="time-hours-input">
                      <Label className="text-sm font-medium text-gray-700">Timmar *</Label>
                      <Input
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={entry.hours}
                        onChange={(e) => updateTimeEntry(entry.id, 'hours', Number(e.target.value))}
                        className="border-gray-300 focus:border-blue-600 focus:ring-blue-600 w-full h-10"
                        placeholder="0.5"
                      />
                    </div>
                    
                    <div className="flex flex-col sm:flex-row sm:items-end gap-3 md:col-span-2">
                      <div className="sm:w-36" data-tour="time-status-select">
                      <Select 
                        value={entry.status} 
                        onValueChange={(value) => updateTimeEntry(entry.id, 'status', value as TimeEntry['status'])}
                      >
                          <SelectTrigger className="border-gray-300 focus:border-blue-600 focus:ring-blue-600 h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Utförd">Utförd</SelectItem>
                            <SelectItem value="Avbokad">Avbokad</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex sm:flex-col gap-2 sm:gap-3 w-full h-full justify-center items-center">
                        {timeEntries.length === 1 ? (
                          <Button 
                            onClick={saveAllEntries} 
                            size="default" 
                            disabled={isSaving || !hasUnsavedChanges}
                            className={`${
                              isSaving 
                                ? 'bg-gray-400 cursor-not-allowed' 
                                : hasUnsavedChanges 
                                  ? 'bg-blue-600 hover:bg-blue-700' 
                                  : 'bg-gray-300 cursor-not-allowed'
                            } text-white transition-colors h-full sm:h-auto`}
                            data-tour="time-save-btn"
                          >
                            {isSaving ? (
                              <>
                                <div className="w-4 h-full mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Sparar...
                              </>
                            ) : (
                              <>
                                <Save className="w-4 h-full m-0" />
                                Spara ({getUnsavedCount()})
                              </>
                            )}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeTimeEntry(entry.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-10" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
                
                {/* Knapp för att lägga till fler tider - nu över linjen */}
                <div className="pt-2 pb-4">
                  <Button 
                    onClick={addTimeEntry} 
                    variant="outline" 
                    size="sm" 
                    className="bg-white hover:bg-gray-50 border-blue-200 text-blue-700 hover:text-blue-800"
                    data-tour="time-add-btn"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Registrera fler tider
                  </Button>
                </div>
                
                {/* Spara alla knapp när det finns fler än 1 tidsregistrering - nu under linjen */}
                {timeEntries.length > 1 && (
                  <div className="flex gap-3 mt-6 pt-4 border-t border-gray-200">
                    <Button 
                      onClick={saveAllEntries} 
                      disabled={isSaving || !hasUnsavedChanges}
                      className={`${
                        isSaving 
                          ? 'bg-gray-400 cursor-not-allowed' 
                          : hasUnsavedChanges 
                            ? 'bg-blue-600 hover:bg-blue-700' 
                            : 'bg-gray-300 cursor-not-allowed'
                      } text-white px-6 py-2`}
                      data-tour="time-save-all-btn"
                    >
                      {isSaving ? (
                        <>
                          <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Sparar alla...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 m-0" />
                          Spara alla ({getUnsavedCount()})
                        </>
                      )}
                    </Button>
                    <Button 
                      onClick={() => {
                        setTimeEntries([{
                          id: "1",
                          caseId: null,
                          date: today(),
                          hours: 1,
                          status: "Utförd"
                        }]);
                        setHasUnsavedChanges(false);
                      }} 
                      variant="outline" 
                      className="px-6 py-2"
                    >
                      Avbryt
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Separerad sektion för att registrera insats - nu underst med samma design */}
      <Card className="mb-6 ">
        <CardHeader className="pb-4">
          <CardTitle className="flex flex-col gap-3 text-gray-800">
            <div className="flex items-center gap-3 lg:ml-0 mobile:mx-6 mobile:mb-4">
              <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                <FileText className="w-4 h-4 text-white" />
              </div>
              <span>Registrera ny insats för kund</span>
            </div>
            <div className="flex gap-3 mobile:w-full">
              <Button 
                onClick={() => setShowCreateCase(!showCreateCase)} 
                variant="outline"
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600 hover:border-blue-700 px-4 py-2 font-medium cursor-pointer z-10 relative mobile:w-full mobile:mx-6 mobile:min-h-10 mobile:mb-0 lg:max-w-fit float-left lg:ml-0"
                data-tour="create-case-toggle"
                type="button"
              >
                {showCreateCase ? 'Dölj formulär' : 'Registrera insats'}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        
        {showCreateCase && (
          <CardContent className="pt-0">
            <div className="py-6 bg-white rounded-lg">
              <div className="mb-4 text-sm text-gray-600">
                Fyll i formuläret nedan för att skapa en ny insats:
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2 flex flex-col pb-0 mb-0">
                  <Label htmlFor="customer" className="text-sm font-medium text-gray-700">Kund *</Label>
                  <KundCombobox 
                    value={newCaseCustomerId} 
                    onChange={setNewCaseCustomerId}
                    placeholder="Välj kund"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="effort" className="text-sm font-medium text-gray-700">Insats *</Label>
                  <Select value={newCaseEffortId} onValueChange={setNewCaseEffortId}>
                    <SelectTrigger className="border-gray-300 focus:border-gray-600 focus:ring-gray-600">
                      <SelectValue placeholder="Välj insats" />
                    </SelectTrigger>
                    <SelectContent>
                      {efforts.map((effort) => (
                        <SelectItem key={effort.id} value={effort.id.toString()}>
                          {effort.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="handler1" className="text-sm font-medium text-gray-700">Behandlare 1 *</Label>
                  <Select value={newCaseHandler1Id} onValueChange={setNewCaseHandler1Id}>
                    <SelectTrigger className="border-gray-300 focus:border-gray-600 focus:ring-gray-600">
                      <SelectValue placeholder="Välj behandlare" />
                    </SelectTrigger>
                    <SelectContent>
                      {handlers.map((handler) => (
                        <SelectItem key={handler.id} value={handler.id.toString()}>
                          {handler.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="handler2" className="text-sm font-medium text-gray-700">Behandlare 2 (valfritt)</Label>
                  <Select value={newCaseHandler2Id} onValueChange={setNewCaseHandler2Id}>
                    <SelectTrigger className="border-gray-300 focus:border-gray-600 focus:ring-gray-600">
                      <SelectValue placeholder="Välj behandlare" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ingen</SelectItem>
                      {handlers.map((handler) => (
                        <SelectItem key={handler.id} value={handler.id.toString()}>
                          {handler.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="flex flex-col gap-3 mt-6 pt-4 border-t border-gray-200 lg:flex-row">
                <Button 
                  onClick={handleCreateCase} 
                  disabled={isLoadingCases}
                  className="bg-gray-800 hover:bg-gray-900 text-white px-6 py-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  data-tour="create-case-save"
                >
                  {isLoadingCases ? (
                    <>
                      <LoadingSpinner size="sm" />
                      Skapar insats...
                    </>
                  ) : (
                    'Skapa insats'
                  )}
                </Button>
                <Button 
                  onClick={() => setShowCreateCase(false)} 
                  variant="outline" 
                  disabled={isLoadingCases}
                  className="px-6 py-2"
                >
                  Avbryt
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Befintliga shifts */}
      <Card className="border-radius-lg">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-lg font-semibold">Registrerade tider</div>
              <div className="text-sm font-light text-blue-700">Översikt över alla tidsregistreringar</div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 w-full">
          <div className="w-full tablet:overflow-x-auto overflow-visible">
            <table className="responsive-table text-center tablet:min-w-[780px]" data-tour="time-history-table">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-4 font-medium text-gray-600 uppercase tracking-wide text-xs sm:text-sm whitespace-nowrap">Kund</th>
                  <th className="px-4 py-4 font-medium text-gray-600 uppercase tracking-wide text-xs sm:text-sm whitespace-nowrap">Behandlare 1</th>
                  <th className="px-4 py-4 font-medium text-gray-600 uppercase tracking-wide text-xs sm:text-sm whitespace-nowrap">Behandlare 2</th>
                  <th className="px-4 py-4 font-medium text-gray-600 uppercase tracking-wide text-xs sm:text-sm whitespace-nowrap">Insats</th>
                  <th className="px-4 py-4 font-medium text-gray-600 uppercase tracking-wide text-xs sm:text-sm whitespace-nowrap">Datum</th>
                  <th className="px-4 py-4 font-medium text-gray-600 uppercase tracking-wide text-xs sm:text-sm whitespace-nowrap">Timmar</th>
                  <th className="px-4 py-4 font-medium text-gray-600 uppercase tracking-wide text-xs sm:text-sm whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                  {isLoadingData ? (
                    // Skeleton loading för tabellen
                    [...Array(3)].map((_, index) => (
                      <tr key={index} className="border-t border-gray-200">
                        <td data-label="Kund" className="px-4 py-4"><Skeleton className="h-4 w-24" /></td>
                        <td data-label="Behandlare 1" className="px-4 py-4"><Skeleton className="h-4 w-20" /></td>
                        <td data-label="Behandlare 2" className="px-4 py-4"><Skeleton className="h-4 w-20" /></td>
                        <td data-label="Insats" className="px-4 py-4"><Skeleton className="h-4 w-24" /></td>
                        <td data-label="Datum" className="px-4 py-4"><Skeleton className="h-4 w-20" /></td>
                        <td data-label="Timmar" className="px-4 py-4"><Skeleton className="h-4 w-16" /></td>
                        <td data-label="Status" className="actions px-4 py-4"><Skeleton className="h-6 w-16 rounded-full" /></td>
                      </tr>
                    ))
                  ) : shifts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                        <div className="py-8">
                          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                          <p className="text-gray-500">Inga registrerade tider hittades.</p>
                          <p className="text-sm text-gray-400 mt-1">Börja med att registrera tid ovan.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    shifts.map((shift) => {
                      const hideCustomer = shift.customer_active === false || shift.customer_name === 'ANONYM';
                      const customerDisplay = hideCustomer ? '—' : (shift.customer_name ?? '—');
                      return (
                        <tr 
                          key={shift.id} 
                          className={`hover:bg-blue-50 border-t border-gray-200 transition-colors cursor-pointer`}
                          onClick={() => handleShiftClick(shift)}
                        >
                          <td data-label="Kund" className="px-4 py-4 font-medium text-gray-800">{customerDisplay}</td>
                          <td data-label="Behandlare 1" className="px-4 py-4 text-gray-600">{shift.handler1_name}</td>
                          <td data-label="Behandlare 2" className="px-4 py-4 text-gray-600">{shift.handler2_name || "-"}</td>
                          <td data-label="Insats" className="px-4 py-4 text-gray-600">{shift.effort_name}</td>
                          <td data-label="Datum" className="px-4 py-4 text-gray-600">{shift.date ? shift.date.slice(0,10) : "-"}</td>
                          <td data-label="Timmar" className="px-4 py-4 text-gray-600 font-medium">{shift.hours}</td>
                          <td data-label="Status" className="actions px-4 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              shift.status === 'Utförd' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {shift.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal för att redigera tidsregistrering */}
      {showEditModal && editingShift && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div 
            ref={modalFocusTrapRef}
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            tabIndex={-1}
          >
            <h3 className="text-lg font-semibold mb-4">Redigera tidsregistrering</h3>
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-gray-700">Kund</Label>
                <div className="text-gray-600">{editingShift.customer_name}</div>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-700">Insats</Label>
                <div className="text-gray-600">{editingShift.effort_name}</div>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-700">Datum *</Label>
                <Input
                  type="date"
                  value={editingShift.date ? editingShift.date.slice(0,10) : ''}
                  onChange={(e) => setEditingShift({...editingShift, date: e.target.value})}
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-700">Timmar *</Label>
                <Input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={editingShift.hours}
                  onChange={(e) => setEditingShift({...editingShift, hours: Number(e.target.value)})}
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-700">Status</Label>
                <Select 
                  value={editingShift.status} 
                  onValueChange={(value) => setEditingShift({...editingShift, status: value as "Utförd" | "Avbokad"})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Utförd">Utförd</SelectItem>
                    <SelectItem value="Avbokad">Avbokad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowEditModal(false);
                  setEditingShift(null);
                }}
              >
                Avbryt
              </Button>
              <Button onClick={handleSaveEditedShift}>
                Spara
              </Button>
            </div>
          </div>
        </div>
      )}
      </div>
    </Layout>
  );
};
