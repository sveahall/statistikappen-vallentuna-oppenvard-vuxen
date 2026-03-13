import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useNavigate } from "react-router-dom";
import { XCircle, Plus, ArrowUpDown, ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createCustomer, getCustomers, softDeleteCustomer, reactivateCustomer, protectCustomer, unprotectCustomer } from "@/lib/api";
import toast from "react-hot-toast";
import { displayGender } from "@/lib/utils";
import { Customer } from "@/types/types";
import { useAuth } from "@/contexts/AuthContext";
import { useRefresh } from "@/contexts/RefreshContext";


type NewCustomer = {
  initials: string;
  gender: string;
  birth_year: number;
  active: boolean;
  startDate: string;
  is_group: boolean;
};

const customerSortFields = [
  { label: "Kund-ID", field: "id" },
  { label: "Initialer", field: "initials" },
  { label: "Kön", field: "gender" },
  { label: "Födelseår", field: "birth_year" },
  { label: "Status", field: "status" },
  { label: "Startdatum", field: "created_at" },
] as const;
type CustomerSortField = (typeof customerSortFields)[number]["field"];

export const KunderPage = (): JSX.Element => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [newCustomers, setNewCustomers] = useState<NewCustomer[]>([]);
  const [errors, setErrors] = useState<{ [idx: number]: { initials?: string; gender?: string; birth_year?: string } }>({});
  const [sortField, setSortField] = useState<CustomerSortField>("id");
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [includeInactive, setIncludeInactive] = useState<boolean>(false);
  const navigate = useNavigate();
  const [savingNew, setSavingNew] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [protecting, setProtecting] = useState<number | null>(null);
  const { user } = useAuth();
  const { refreshKey, triggerRefresh } = useRefresh();

  const handleRowClick = (customer: Customer) => {
    if (customer.is_protected && customer.can_view === false) {
      // för icke-tilldelade: blockera navigering
      toast.error('Åtkomst nekad till skyddad kund');
      return;
    }
    navigate(`/kunder/${customer.id}`);
  };

  const handleDelete = async (id: number) => {
    setDeleting(true);
    try {
      await softDeleteCustomer(id.toString());
      const updated = await getCustomers(includeInactive);
      setCustomers(updated);
      setDeleteId(null);
      toast.success("Kund avaktiverad!");
      triggerRefresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Kunde inte avaktivera kund";
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const handleReactivate = async (id: number) => {
    setReactivating(true);
    try {
      await reactivateCustomer(id.toString());
      const updated = await getCustomers(includeInactive);
      setCustomers(updated);
      toast.success("Kund återaktiverad!");
      triggerRefresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Kunde inte återaktivera kund";
      toast.error(message);
    } finally {
      setReactivating(false);
    }
  };

  const handleToggleProtected = async (c: Customer) => {
    if (!user || user.role !== 'admin') return;
    setProtecting(c.id);
    try {
      if (c.is_protected) {
        await unprotectCustomer(c.id);
        toast.success('Skyddad identitet avmarkerad');
      } else {
        await protectCustomer(c.id);
        toast.success('Kund markerad som skyddad');
      }
      const updated = await getCustomers(includeInactive);
      setCustomers(updated);
      triggerRefresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Kunde inte ändra skyddsstatus';
      toast.error(message);
    } finally {
      setProtecting(null);
    }
  };

  const getToday = () => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  };

  const handleAddCustomer = () => {
    setNewCustomers(prev => [
      ...prev,
      { initials: "", gender: "", birth_year: 0, active: true, startDate: getToday(), is_group: false },
    ]);
  };

  const handleChangeNewCustomer = (idx: number, field: keyof NewCustomer, value: string | number | boolean) => {
    // Konvertera initialer till versaler automatiskt
    if (field === 'initials' && typeof value === 'string') {
      value = value.toUpperCase();
    }
    
    setNewCustomers(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      if (field === 'is_group') {
        const checked = value === true;
        return {
          ...c,
          is_group: checked,
          gender: checked ? '' : c.gender,
          birth_year: checked ? 0 : c.birth_year,
        };
      }
      return { ...c, [field]: value } as NewCustomer;
    }));
    // Validera direkt när man skriver
    setErrors(prev => {
      const updated = { ...prev };
      const updatedCustomer = { ...newCustomers[idx], [field]: value } as NewCustomer;
      if (field === 'is_group' && value === true) {
        updatedCustomer.gender = '';
        updatedCustomer.birth_year = 0;
      }
      updated[idx] = validateCustomer(updatedCustomer);
      return updated;
    });
  };

  const handleCancelAdd = (idx: number) => {
    setNewCustomers(prev => prev.filter((_, i) => i !== idx));
  };

  const validateCustomer = (c: NewCustomer) => {
    const err: { initials?: string; gender?: string; birth_year?: string } = {};
    if (!c.initials) err.initials = "Obligatoriskt fält";
    if (!c.is_group) {
      if (!c.gender) err.gender = "Obligatoriskt fält";
      if (!c.birth_year) err.birth_year = "Obligatoriskt fält";
      else if (!/^\d{4}$/.test(c.birth_year.toString())) err.birth_year = "Födelseår måste vara 4 siffror";
    }
    return err;
  };

  const handleSaveNewCustomers = async () => {
    if (newCustomers.length === 0) return;
    let hasError = false;
    const newErrors: typeof errors = {};
    newCustomers.forEach((c, idx) => {
      const err = validateCustomer(c);
      if (Object.keys(err).length > 0) {
        newErrors[idx] = err;
        hasError = true;
      }
    });
    setErrors(newErrors);
    if (hasError) return;
    setSavingNew(true);
    try {
      await Promise.all(
        newCustomers.map(c =>
          createCustomer({
            initials: c.initials,
            gender: c.is_group ? undefined : c.gender,
            birthYear: c.is_group ? undefined : c.birth_year,
            startDate: c.startDate,
            isGroup: c.is_group
          })
        )
      );
      const updated = await getCustomers(includeInactive);
      setCustomers(updated);
      setNewCustomers([]);
      setErrors({});
      toast.success("Kund/kunder sparade!");
      triggerRefresh();
    } catch (err) {
      toast.error("Kunde inte spara kund/kunder");
    } finally {
      setSavingNew(false);
    }
  };

  useEffect(() => {
    getCustomers(includeInactive)
      .then(setCustomers)
      .catch(() => toast.error("Kunde inte hämta kunder"));
  }, [includeInactive, refreshKey]);

  // Sortera kunder
  const getComparableValue = (customer: Customer, field: CustomerSortField): string | number | Date => {
    switch (field) {
      case "created_at":
        return customer.created_at ? new Date(customer.created_at) : new Date(0);
      case "status":
        return customer.active ? 1 : 0;
      case "id":
        return customer.id;
      case "initials":
        return customer.initials ?? "";
      case "gender":
        return customer.gender ?? "";
      case "birth_year":
        return customer.birth_year ?? 0;
      default:
        return "";
    }
  };

  const sortedCustomers = [...customers].sort((a, b) => {
    const av = getComparableValue(a, sortField);
    const bv = getComparableValue(b, sortField);
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ? 1 : -1;
    return 0;
  });

  return (
    <Layout title="Kunder">
      <div className="w-full flex flex-col gap-4 lg:items-start sm:items-center sm:justify-between">
      {/* Header section */}
      <div className="flex flex-row flext-start float-left lg:flex-row mobile:flex-col gap-3 sm:flex-col">
        <Button
          variant="outline"
          className="w-full sm:w-auto items-center justify-center gap-3 px-4 mobile:px-7 py-3 rounded-lg text-base mobile:text-lg text-[var(--tenant-brand)] font-semibold bg-white hover:bg-[var(--tenant-brand-soft)] hover:shadow-md transition"
          onClick={handleAddCustomer}
          data-tour="customers-add-btn"
        >
          <Plus className="w-5 h-5 mobile:w-6 mobile:h-6 font-bold" />
          <span>Lägg till ny kund</span>
        </Button>
        {newCustomers.length > 0 && (
          <Button
            variant="default"
            className="w-full sm:w-auto px-4 mobile:px-6 py-3 rounded-lg text-base mobile:text-lg font-semibold"
            onClick={handleSaveNewCustomers}
            disabled={savingNew || newCustomers.some((c) => Object.keys(validateCustomer(c)).length > 0)}>
            {savingNew ? <><Loader2 className="animate-spin w-5 h-5 mr-2 inline"/>Sparar...</> : "Spara alla"}
          </Button>
        )}
      </div>

      <label className="flex items-left justify-start align-left gap-2 text-sm mt-2 mobile:mt-0" data-tour="customers-include-inactive">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Inkludera inaktiva kunder
        </label>

      {/* Table card */}
        <Card className="bg-white rounded-xl shadow-sm w-full">
        <CardContent className="p-0">
          <div className="tablet:overflow-x-auto overflow-visible min-w-0">
            <table className="responsive-table text-left mt-3 tablet:min-w-[800px]" data-tour="customers-table">
              <thead>
                <tr >
                  {customerSortFields.map(col => (
                    <th
                      key={col.field}
                      className="px-1 mobile:px-4 py-2 mobile:py-3 font-semibold text-gray-500 uppercase tracking-wider text-xs mobile:text-sm text-center cursor-pointer select-none group whitespace-nowrap"
                      onClick={() => {
                        if (sortField === col.field) {
                          setSortAsc(a => !a);
                        } else {
                          setSortField(col.field);
                          setSortAsc(true);
                        }
                      }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortField === col.field ? (
                          sortAsc ? <ArrowUp className="w-3 h-3 mobile:w-4 mobile:h-4 inline" /> : <ArrowDown className="w-3 h-3 mobile:w-4 mobile:h-4 inline" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 mobile:w-4 mobile:h-4 opacity-30 group-hover:opacity-60 inline" />
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="px-2 mobile:px-4 py-2 mobile:py-3 font-semibold text-gray-500 uppercase tracking-wider text-xs mobile:text-sm text-center whitespace-nowrap">Åtgärder</th>
                </tr>
              </thead>
              <tbody className="min-w-0 w-full">
                {newCustomers.map((c, idx) => (
                  <tr key={idx} className="bg-gray-50">
                    <td data-label="Kund-ID" className="px-2 mobile:px-4 py-2 mobile:py-3 text-gray-400 italic text-center text-xs mobile:text-sm whitespace-nowrap">(genereras)</td>
                    <td data-label="Initialer" className="px-2 mobile:px-4 py-2 mobile:py-3 text-center">
                      <input
                        type="text"
                        placeholder="Initialer"
                        className={`border rounded px-2 py-1 w-full max-w-[80px] text-center text-xs mobile:text-sm focus:outline-none focus:ring-2 ${errors[idx]?.initials ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-[var(--tenant-brand)]'}`}
                        value={c.initials}
                        onChange={e => handleChangeNewCustomer(idx, "initials", e.target.value)}
                      />
                      {errors[idx]?.initials && <span className="text-red-500 text-xs mt-1 block">{errors[idx].initials}</span>}
                    </td>
                    <td data-label="Kön" className="px-2 mobile:px-4 py-2 mobile:py-3 text-center">
                      {!c.is_group ? (
                        <>
                          <select
                            className={`border rounded px-2 py-1 w-full text-center text-xs mobile:text-sm focus:outline-none focus:ring-2 ${errors[idx]?.gender ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-[var(--tenant-brand)]'}`}
                            value={c.gender}
                            onChange={e => handleChangeNewCustomer(idx, "gender", e.target.value)}
                          >
                            <option value="">Välj kön</option>
                            <option value="Kvinna">Kvinna</option>
                            <option value="Man">Man</option>
                            <option value="Icke-binär">Icke-binär</option>
                          </select>
                          {errors[idx]?.gender && <span className="text-red-500 text-xs mt-1 block">{errors[idx].gender}</span>}
                        </>
                      ) : (
                        <span className="text-gray-400 text-xs whitespace-nowrap">—</span>
                      )}
                    </td>
                    <td data-label="Födelseår" className="px-2 mobile:px-4 py-2 mobile:py-3 text-center">
                      {!c.is_group ? (
                        <>
                          <input
                            type="text"
                            placeholder="Födelseår"
                            className={`border rounded px-auto py-1 w-full max-w-[80px] text-center text-xs mobile:text-sm focus:outline-none focus:ring-2 ${errors[idx]?.birth_year ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-[var(--tenant-brand)]'}`}
                            value={c.birth_year || ''}
                            onChange={e => handleChangeNewCustomer(idx, "birth_year", parseInt(e.target.value) || 0)}
                          />
                          {errors[idx]?.birth_year && <span className="text-red-500 text-xs mt-1 block">{errors[idx].birth_year}</span>}
                        </>
                      ) : (
                        <span className="text-gray-400 text-xs whitespace-nowrap">—</span>
                      )}
                    </td>
                    <td data-label="Status" className="px-2 mobile:px-4 py-2 mobile:py-3 text-center whitespace-nowrap">
                      <span className="inline-block px-2 mobile:px-3 py-1 text-xs rounded-full font-semibold bg-green-100 text-green-800">
                        Pågående
                      </span>
                    </td>
                    <td data-label="Startdatum" className="px-2 mobile:px-4 py-2 mobile:py-3 text-center">
                      <input
                        type="date"
                        className="border rounded px-2 py-1 w-full max-w-[120px] text-center text-xs mobile:text-sm"
                        value={c.startDate}
                        onChange={e => handleChangeNewCustomer(idx, "startDate", e.target.value)}
                      />
                    </td>
                    <td data-label="Åtgärder" className="actions px-2 mobile:px-4 py-2 mobile:py-3 text-center whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-center">
                        <label className="inline-flex gap-2 min-w-[60px] text-xs mobile:text-sm">
                          <input
                            type="checkbox"
                            checked={c.is_group}
                            onChange={e => handleChangeNewCustomer(idx, "is_group", e.target.checked)}
                          />
                          Grupp
                        </label>
                        <Button size="sm" variant="outline" onClick={() => handleCancelAdd(idx)} className="text-xs mobile:text-sm">
                          Avbryt
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    className={`hover:bg-gray-50 cursor-pointer w-full min-w-0 m-auto border-t border-gray-200 ${!customer.active ? 'bg-gray-100 text-gray-400' : ''}`}
                    onClick={() => handleRowClick(customer)}
                  >
                    <td data-label="Kund-ID" className="px-2 mobile:px-4 py-2 mobile:py-3 font-medium text-center text-xs mobile:text-sm whitespace-nowrap">{customer.id}</td>
                    <td data-label="Initialer" className="px-2 mobile:px-4 py-2 mobile:py-3 text-center text-xs mobile:text-sm">
                      <div className="flex items-center justify-center gap-2">
                        <span>{customer.active ? customer.initials : '—'}</span>
                        {customer.is_group && (
                          <span className="inline-block px-2 py-0.5 text-[10px] rounded-full bg-blue-100 text-blue-700 uppercase tracking-wide">Grupp</span>
                        )}
                      </div>
                    </td>
                    <td data-label="Kön" className="px-2 mobile:px-4 py-2 mobile:py-3 text-center text-xs mobile:text-sm whitespace-nowrap">{customer.is_group ? '—' : displayGender(customer.gender)}</td>
                    <td data-label="Födelseår" className="px-2 mobile:px-4 py-2 mobile:py-3 text-center text-xs mobile:text-sm whitespace-nowrap">{customer.is_group ? '—' : (customer.birth_year ?? '—')}</td>
                    <td data-label="Status" className="px-2 mobile:px-4 py-2 mobile:py-3 text-center whitespace-nowrap">
                      <span className={`inline-block px-2 mobile:px-3 py-1 text-xs rounded-full font-semibold ${
                        customer.active
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}>
                        {customer.active ? "Pågående" : "Avslutad"}
                      </span>
                    </td>
                    <td data-label="Startdatum" className="px-2 mobile:px-4 py-2 mobile:py-3 text-center text-xs mobile:text-sm whitespace-nowrap">{customer.created_at?.slice(0, 10)}</td>
                    <td data-label="Åtgärder" className="actions px-2 mobile:px-4 py-2 mobile:py-3 text-center whitespace-nowrap">
                      <div className="flex gap-2 items-center justify-center" onClick={e => e.stopPropagation()}>
                        {customer.active ? (
                          <button
                            className="p-1.5 mobile:p-2 hover:bg-gray-200 rounded-full"
                            title="Avaktivera kund"
                            aria-label="Avaktivera kund"
                            onClick={() => setDeleteId(customer.id)}
                          >
                            <XCircle className="w-4 h-4 mobile:w-5 mobile:h-5 text-red-500" />
                          </button>
                        ) : (
                          <button
                            className="p-1.5 mobile:p-2 hover:bg-gray-200 rounded-full"
                            title="Återaktivera kund"
                            aria-label="Återaktivera kund"
                            onClick={() => handleReactivate(customer.id)}
                            disabled={reactivating}
                          >
                            {reactivating ? <Loader2 className="animate-spin w-3 h-3 mobile:w-4 mobile:h-4 inline"/> : <span className="text-green-600 font-semibold text-xs mobile:text-sm">Återaktivera</span>}
                          </button>
                        )}
                        {user?.role === 'admin' && (
                          <button
                            className="p-1.5 mobile:p-2 hover:bg-gray-200 rounded-full"
                            title={customer.is_protected ? "Avmarkera skydd" : "Markera som skyddad"}
                            aria-label={customer.is_protected ? "Avmarkera skydd" : "Markera som skyddad"}
                            onClick={() => handleToggleProtected(customer)}
                            disabled={protecting === customer.id}
                          >
                            {protecting === customer.id ? (
                              <Loader2 className="animate-spin w-4 h-4" />
                            ) : (
                              <span className="text-purple-700 font-semibold text-xs mobile:text-sm">
                                {customer.is_protected ? 'Avskydda' : 'Skydda'}
                              </span>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Popup för radering */}
          {deleteId && (
            <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30 z-50 p-4">
              <div className="bg-white rounded-lg shadow-lg p-6 mobile:p-8 max-w-sm w-full flex flex-col items-center">
                <div className="text-base mobile:text-lg font-semibold mb-4 text-center">Vill du verkligen radera denna kund?</div>
                <div className="text-sm text-gray-600 mb-4 text-center">Den försvinner inte helt men initialerna raderas permanent.</div>
                <div className="flex flex-col mobile:flex-row gap-3 mobile:gap-4 mt-2 w-full">
                  <Button
                    variant="outline"
                    onClick={() => setDeleteId(null)}
                    className="w-full mobile:w-auto min-w-[100px]"
                  >
                    Avbryt
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleDelete(deleteId)}
                    className="w-full mobile:w-auto min-w-[100px]"
                    disabled={deleting}
                  >
                    {deleting ? <><Loader2 className="animate-spin w-5 h-5 mr-2 inline"/>Raderar...</> : "Radera"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
        </Card>
      </div>
    </Layout>
  );
};
