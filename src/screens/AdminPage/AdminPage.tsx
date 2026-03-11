import React, { useCallback, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { MoreHorizontal, PlusCircle, RefreshCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Modal } from "@/components/ui/modal";
import AuditLog from "./components/AuditLog";
import { Effort, Handler, Invite } from "@/types/types";
import toast from "react-hot-toast";
import { api } from "@/lib/apiClient";
import { formatAvailableFor } from "@/lib/effortLabels";
import { useRefresh } from "@/contexts/RefreshContext";
import { getRoleLabel } from "@/lib/roleLabels";
import { tenant } from "@/config/tenant";


const TableHeader = ({ children }: { children: React.ReactNode }) => (
  <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-sm">{children}</th>
);

const TableRow = ({ children }: { children: React.ReactNode }) => (
  <tr className="hover:bg-gray-50 border-t border-gray-200">{children}</tr>
);

const TableCell = ({
  children,
  className = "",
  label,
  isActions = false,
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
  isActions?: boolean;
}) => (
  <td
    data-label={label}
    className={`px-6 py-4 text-gray-600 ${isActions ? "actions " : ""}${className}`}
  >
    {children}
  </td>
);

export const AdminPage = (): JSX.Element => {
  const [insatser, setInsatser] = React.useState<Effort[]>([]);
  const [openModal, setOpenModal] = React.useState(false);
  const [newInsats, setNewInsats] = React.useState({ name: "", for: "Behovsprövad" });
  const [editIdx, setEditIdx] = React.useState<number | null>(null);
  const [editInsats, setEditInsats] = React.useState<{ name: string; for: string }>({ name: "", for: "Behovsprövad" });
  const [openEditModal, setOpenEditModal] = React.useState(false);
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);
  const [handlers, setHandlers] = React.useState<Handler[]>([]);
  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [invitesLoading, setInvitesLoading] = React.useState(false);
  const [inviteToken, setInviteToken] = React.useState<string | null>(null);
  const [inviteVerificationCode, setInviteVerificationCode] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [editHandler, setEditHandler] = React.useState<{ id: number, name: string, email: string } | null>(null);
  const [openEditHandlerModal, setOpenEditHandlerModal] = React.useState(false);
  const [showInactive, setShowInactive] = React.useState(false);
  const [showInactiveEfforts, setShowInactiveEfforts] = React.useState(false);
  
  // Lösenordsåterställning (likt invite-systemet)
  const [resetPasswordToken, setResetPasswordToken] = React.useState<string | null>(null);
  const [resetPasswordCopied, setResetPasswordCopied] = React.useState(false);
  const { refreshKey, triggerRefresh } = useRefresh();

  const fetchEfforts = useCallback(async () => {
    try {
      const url = showInactiveEfforts ? `/efforts?all=true` : `/efforts`;
      const res = await api(url);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setInsatser(data);
    } catch {
      toast.error("Kunde inte hämta insatser");
      setInsatser([]);
    }
  }, [showInactiveEfforts]);

  useEffect(() => {
    fetchEfforts();
  }, [fetchEfforts, refreshKey]);

  const fetchHandlers = useCallback(async () => {
    try {
      const url = showInactive ? `/handlers?all=true` : `/handlers`;
      const res = await api(url);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setHandlers(data);
    } catch {
      toast.error("Kunde inte hämta behandlare");
      setHandlers([]);
    }
  }, [showInactive]);

  useEffect(() => {
    fetchHandlers();
  }, [fetchHandlers, refreshKey]);

  useEffect(() => {
    fetchInvites();
  }, [refreshKey]);

  async function fetchInvites() {
    try {
      setInvitesLoading(true);
      const res = await api(`/invites`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const pendingOnly = (data as Invite[]).filter(invite => invite.status === 'pending');
      setInvites(pendingOnly);
    } catch {
      toast.error("Kunde inte hämta inbjudningar");
      setInvites([]);
    } finally {
      setInvitesLoading(false);
    }
  }

  // Lägg till insats
  const handleAddInsats = async () => {
      try {
        const res = await api(`/efforts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newInsats.name, available_for: newInsats.for })
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || "Kunde inte spara insats");
        }
      const created = await res.json();
      setInsatser(prev => [...prev, created]);
      setNewInsats({ name: "", for: "Behovsprövad" });
      setOpenModal(false);
      triggerRefresh();
    } catch (err: any) {
      toast.error(err?.message || "Kunde inte spara insats");
    }
  };

  // Redigera insats
  const handleEditInsats = async () => {
    if (editIdx == null) return;
      try {
        const res = await api(`/efforts/${insatser[editIdx].id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editInsats.name, available_for: editInsats.for })
        });
        if (!res.ok) throw new Error();
        const updated = await res.json();
        setInsatser(prev => prev.map(i => i.id === insatser[editIdx].id ? updated : i));
        setOpenEditModal(false);
        triggerRefresh();
      } catch {
        toast.error("Kunde inte uppdatera insats");
      }
  };

  // Radera insats

  const [newHandler, setNewHandler] = React.useState({ email: "", role: "handler" });
  const [openHandlerModal, setOpenHandlerModal] = React.useState(false);
  const [handlerErrors, setHandlerErrors] = React.useState<{ email?: string; role?: string }>({});

  function validateHandler(handler: { email: string; role: string }) {
    const errors: { email?: string; role?: string } = {};
    if (!handler.email) errors.email = "E-post är obligatoriskt";
    else if (!/^\S+@\S+\.\S+$/.test(handler.email)) errors.email = "Ogiltig e-postadress";
    if (!handler.role) errors.role = "Roll är obligatorisk";
    else if (!['handler', 'admin'].includes(handler.role)) errors.role = "Ogiltig roll";
    return errors;
  }

  async function handleAddHandler() {
    const errors = validateHandler(newHandler);
    setHandlerErrors(errors);
    if (Object.keys(errors).length > 0) return;
    try {
      // Skapa invite direkt (ingen handler skapas än)
      const inviteRes = await api(`/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: newHandler.email, 
          role: newHandler.role 
        })
      });
      if (!inviteRes.ok) {
        const errorData = await inviteRes.json();
        throw new Error(errorData.error || 'Kunde inte skapa inbjudan');
      }
      
      const invite = await inviteRes.json();
      
      // Visa invite-information för admin
      setInviteToken(invite.token);
      setInviteVerificationCode(invite.verification_code);
      
      // Rensa formuläret
      setNewHandler({ email: "", role: "handler" });
      setHandlerErrors({});
      setOpenHandlerModal(false);
      
      // Uppdatera handlers-listan
      fetchHandlers();
      fetchInvites();
      
      toast.success(`Inbjudan skapad för ${invite.email}`);
      triggerRefresh();
      
    } catch (error) {
      console.error('Error creating invite:', error);
      toast.error(error instanceof Error ? error.message : "Kunde inte skapa inbjudan");
    }
  }

  async function generatePasswordResetLink(handlerId: number, handlerEmail: string) {
    try {
      const res = await api(`/handlers/${handlerId}/generate-reset-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: handlerEmail })
      });
      
      if (!res.ok) throw new Error();
      
      const data = await res.json();
      setResetPasswordToken(data.resetUrl);
      setResetPasswordCopied(false);
      triggerRefresh();
    } catch {
      toast.error("Kunde inte generera återställningslänk");
    }
  }

  async function handleRegenerateInvite(inviteId: number) {
    try {
      const res = await api(`/invites/${inviteId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Kunde inte uppdatera inbjudan');
      }

      const data = await res.json();
      setInviteToken(data.token);
      setInviteVerificationCode(data.verification_code ?? null);
      setCopied(false);
      toast.success('Ny inbjudningslänk genererad');
      fetchInvites();
    } catch (error) {
      console.error('Error regenerating invite:', error);
      toast.error(error instanceof Error ? error.message : "Kunde inte uppdatera inbjudan");
    }
  }

  async function handleCancelInvite(inviteId: number) {
    if (!window.confirm('Avbryt denna inbjudan? Den kan inte användas efteråt.')) return;
    try {
      const res = await api(`/invites/${inviteId}/cancel`, {
        method: "POST",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Kunde inte avbryta inbjudan');
      }

      toast.success('Inbjudan avbruten');
      fetchInvites();
    } catch (error) {
      console.error('Error cancelling invite:', error);
      toast.error(error instanceof Error ? error.message : "Kunde inte avbryta inbjudan");
    }
  }

  const formatDateTime = (value?: string | null) => {
    if (!value) return '–';
    try {
      return new Date(value).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return value;
    }
  };

  return (
    <Layout title="Admin">
      <div className="flex flex-col w-full max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 gap-4 sm:gap-6 lg:gap-8 py-2 sm:py-14">

      <Tabs defaultValue="insatser" className="w-full">
        <TabsList className="flex flex-col mobile:flex-row w-full bg-gray-100 rounded-lg mobile:rounded-2xl mb-4 p-1 gap-2 mobile:gap-2">
          <TabsTrigger value="insatser" className="w-full mobile:flex-1 py-3 px-3 text-sm mobile:text-base rounded-lg mobile:rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[var(--tenant-brand)] data-[state=inactive]:text-gray-500 transition font-medium whitespace-normal mobile:whitespace-nowrap">Insatser</TabsTrigger>
          <TabsTrigger value="behandlare" className="w-full mobile:flex-1 py-3 px-3 text-sm mobile:text-base rounded-lg mobile:rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[var(--tenant-brand)] data-[state=inactive]:text-gray-500 transition font-medium whitespace-normal mobile:whitespace-nowrap">Behandlare</TabsTrigger>
          <TabsTrigger value="logg" className="w-full mobile:flex-1 py-3 px-3 text-sm mobile:text-base rounded-lg mobile:rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[var(--tenant-brand)] data-[state=inactive]:text-gray-500 transition font-medium whitespace-normal mobile:whitespace-nowrap">Granskningslogg</TabsTrigger>
        </TabsList>
        <TabsContent value="insatser">
          <Card className="flex-1 bg-white border border-gray-200 rounded-lg sm:rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] mt-4 sm:mt-6">
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex flex-col sm:flex-row justify-start mb-4 gap-3 sm:gap-4 lg:gap-6 items-start sm:items-center w-full">
                <Button variant="outline" className="flex items-center gap-2 w-full sm:w-auto text-sm sm:text-base py-2.5 sm:py-3" onClick={() => setOpenModal(true)}>
                  <PlusCircle className="w-4 h-4 sm:w-5 sm:h-5" /> Lägg till ny insats
                </Button>
                <label className="flex items-center gap-2 text-sm w-full sm:w-auto py-2">
                  <input type="checkbox" checked={showInactiveEfforts} onChange={e => setShowInactiveEfforts(e.target.checked)} className="w-4 h-4" />
                  Visa inaktiva insatser
                </label>
              </div>
              <div className="tablet:overflow-x-auto overflow-visible">
                <table className="responsive-table text-left tablet:min-w-[720px]">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <TableHeader>Insats</TableHeader>
                      <TableHeader>Tillgänglig för</TableHeader>
                      <TableHeader>Åtgärder</TableHeader>
                    </tr>
                  </thead>
                  <tbody>
                    {insatser.map((i, idx) => (
                      <TableRow key={i.id}>
                        <TableCell label="Insats" className={`font-medium ${i.active ? "text-gray-800" : "text-gray-400 italic"}`}>{i.name}</TableCell>
                        <TableCell label="Tillgänglig för" className={i.active ? "" : "text-gray-400 italic"}>{formatAvailableFor(i.name, i.available_for)}</TableCell>
                        <TableCell label="Åtgärder" isActions>
                          {i.active ? (
                            <Button variant="ghost" size="icon" onClick={() => {
                              setEditIdx(idx);
                              setEditInsats({ name: i.name, for: i.available_for });
                              setOpenEditModal(true);
                            }}>
                              <MoreHorizontal className="w-5 h-5" />
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  const res = await api(`/efforts/${i.id}/activate`, { method: "PUT" });
                                  if (!res.ok) throw new Error();
                                  fetchEfforts();
                                } catch {
                                  toast.error("Kunde inte aktivera insats");
                                }
                              }}
                            >
                              Återaktivera
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </tbody>
                </table>
              </div>
          </CardContent>
        </Card>

          <Modal open={openModal} onClose={() => setOpenModal(false)}>
            <div className="w-full max-w-lg p-4 sm:p-6 lg:p-8 bg-white rounded-lg sm:rounded-2xl shadow-lg">
              <h2 className="text-base sm:text-lg lg:text-xl font-semibold mb-4">Lägg till ny insats</h2>
              <div className="flex flex-col gap-4">
                <label className="text-sm font-medium text-gray-700">Namn på insats</label>
                <input type="text" className="border rounded px-3 py-2" value={newInsats.name} onChange={e => setNewInsats({ ...newInsats, name: e.target.value })} placeholder="Namn på insats" />
                <label className="text-sm font-medium text-gray-700">Tillgänglig för</label>
                <select className="border rounded px-3 py-2" value={newInsats.for} onChange={e => setNewInsats({ ...newInsats, for: e.target.value })}>
                  <option value="Behovsprövad">Behovsprövad</option>
                  <option value="Förebyggande arbete">Förebyggande arbete</option>
                  <option value="Behovsprövad, Förebyggande arbete">Behovsprövad, Förebyggande arbete</option>
                  <option value="IUB">IUB</option>
                  <option value="Behovsprövad, IUB">Behovsprövad, IUB</option>
                </select>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-end mt-6">
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => setOpenModal(false)}>Avbryt</Button>
                <Button variant="default" className="w-full sm:w-auto" onClick={handleAddInsats}>Spara</Button>
              </div>
            </div>
          </Modal>
          <Modal open={openEditModal} onClose={() => setOpenEditModal(false)}>
            <div className="w-full max-w-lg p-4 sm:p-6 lg:p-8 bg-white rounded-lg sm:rounded-2xl shadow-lg">
              <h2 className="text-base sm:text-lg lg:text-xl font-semibold mb-4">Redigera insats</h2>
              <div className="flex flex-col gap-4">
                <label className="text-sm font-medium text-gray-700">Namn på insats</label>
                <input type="text" className="border rounded px-3 py-2" value={editInsats.name} onChange={e => setEditInsats({ ...editInsats, name: e.target.value })} placeholder="Namn på insats" />
                <label className="text-sm font-medium text-gray-700">Tillgänglig för</label>
                <select className="border rounded px-3 py-2" value={editInsats.for} onChange={e => setEditInsats({ ...editInsats, for: e.target.value })}>
                  <option value="Behovsprövad">Behovsprövad</option>
                  <option value="Förebyggande arbete">Förebyggande arbete</option>
                  <option value="Behovsprövad, Förebyggande arbete">Behovsprövad, Förebyggande arbete</option>
                  <option value="IUB">IUB</option>
                  <option value="Behovsprövad, IUB">Behovsprövad, IUB</option>
                </select>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-between mt-6">
                <Button variant="destructive" className="w-full sm:w-auto" onClick={() => setShowDeleteModal(true)}>Radera</Button>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <Button variant="outline" className="w-full sm:w-auto" onClick={() => setOpenEditModal(false)}>Avbryt</Button>
                  <Button variant="default" className="w-full sm:w-auto" onClick={handleEditInsats}>Spara</Button>
                </div>
              </div>
            </div>
          </Modal>
          <Modal open={showDeleteModal} onClose={() => setShowDeleteModal(false)}>
            <div className="w-full max-w-lg p-4 sm:p-6 lg:p-8 bg-white rounded-lg sm:rounded-2xl shadow-lg">
              <h2 className="text-base sm:text-lg lg:text-xl font-semibold mb-4">Radera insats</h2>
              <p>Är du säker på att du vill avaktivera insatsen?</p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-end mt-6">
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => setShowDeleteModal(false)}>Avbryt</Button>
                <Button
                  variant="destructive"
                  className="w-full sm:w-auto"
                  onClick={async () => {
                    if (editIdx != null) {
                      try {
                        const res = await api(`/efforts/${insatser[editIdx].id}/deactivate`, { method: "PUT" });
                        if (!res.ok) throw new Error();
                        setShowDeleteModal(false);
                        setOpenEditModal(false);
                        fetchEfforts();
                      } catch {
                        toast.error("Kunde inte avaktivera insats");
                      }
                    }
                  }}
                >
                  Avaktivera
                </Button>
              </div>
            </div>
          </Modal>
        </TabsContent>
        <TabsContent value="behandlare">
          <Card className="flex-1 bg-white border border-gray-200 rounded-lg sm:rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] mt-4 sm:mt-6">
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex flex-col sm:flex-row justify-start mb-4 gap-3 sm:gap-4 lg:gap-6 items-start sm:items-center">
                <Button variant="outline" className="flex items-center gap-2 w-full sm:w-auto text-sm sm:text-base py-2.5 sm:py-3" onClick={() => setOpenHandlerModal(true)}>
                  <PlusCircle className="w-4 h-4 sm:w-5 sm:h-5" /> Lägg till ny behandlare
                </Button>
                <label className="flex items-center gap-2 text-sm w-full sm:w-auto py-2">
                  <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="w-4 h-4" />
                  Visa inaktiva behandlare
                </label>
              </div>
              <div className="tablet:overflow-x-auto overflow-visible">
                <table className="responsive-table text-left tablet:min-w-[720px]">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <TableHeader>Namn</TableHeader>
                      <TableHeader>Mail</TableHeader>
                      <TableHeader>Åtgärder</TableHeader>
                    </tr>
                  </thead>
                  <tbody>
                    {handlers.map(h => (
                      <TableRow key={h.id}>
                        <TableCell label="Namn" className={`font-medium ${h.active ? "text-gray-800" : "text-gray-400 italic"}`}>{h.name}</TableCell>
                        <TableCell label="Mail" className={h.active ? "" : "text-gray-400 italic"}>{h.email}</TableCell>
                        <TableCell label="Åtgärder" isActions>
                          {h.active ? (
                            <Button variant="ghost" size="icon" onClick={() => {
                              setEditHandler({ id: h.id, name: h.name, email: h.email });
                              setOpenEditHandlerModal(true);
                            }}>
                              <MoreHorizontal className="w-5 h-5" />
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  const res = await api(`/handlers/${h.id}/activate`, { method: "PUT" });
                                  if (!res.ok) throw new Error();
                                  fetchHandlers();
                                } catch {
                                  toast.error("Kunde inte aktivera behandlare");
                                }
                              }}
                            >
                              Återaktivera
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="flex-1 bg-white border border-gray-200 rounded-lg sm:rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] mt-4 sm:mt-6">
            <CardContent className="p-3 sm:p-4 lg:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800">Aktiva inbjudningar</h3>
                  <p className="text-xs sm:text-sm text-gray-500">Kopiera eller generera om länkar till behandlare som inte skapat konto ännu.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchInvites}
                  className="flex items-center gap-2"
                >
                  <RefreshCcw className="w-4 h-4" /> Uppdatera
                </Button>
              </div>

              {invitesLoading ? (
                <div className="text-sm text-gray-500">Laddar inbjudningar...</div>
              ) : invites.length === 0 ? (
                <div className="text-sm text-gray-500">Inga aktiva inbjudningar just nu.</div>
              ) : (
                <div className="tablet:overflow-x-auto overflow-visible">
                  <p className="text-xs text-gray-500 mb-3">
                    Av säkerhetsskäl visas länkar och verifieringskoder endast vid skapande eller när du väljer &quot;Ny länk&quot;.
                  </p>
                  <table className="responsive-table text-left tablet:min-w-[760px]">
                    <thead>
                      <tr className="border-b border-gray-200 text-sm text-gray-500 uppercase tracking-wide">
                        <th className="px-4 py-3">E-post</th>
                        <th className="px-4 py-3">Skapad</th>
                        <th className="px-4 py-3">Går ut</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Åtgärder</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invites.map(invite => (
                        <tr key={invite.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td data-label="E-post" className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-800">{invite.email}</div>
                            <div className="text-xs text-gray-500">{getRoleLabel(invite.role) || invite.role}</div>
                          </td>
                          <td data-label="Skapad" className="px-4 py-3 text-sm text-gray-600">{formatDateTime(invite.created_at)}</td>
                          <td data-label="Går ut" className="px-4 py-3 text-sm text-gray-600">{formatDateTime(invite.expires_at)}</td>
                          <td data-label="Status" className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${invite.status === 'pending' ? 'bg-green-100 text-green-700' : invite.status === 'accepted' ? 'bg-blue-100 text-blue-700' : invite.status === 'cancelled' ? 'bg-gray-200 text-gray-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {invite.status_display || invite.status}
                            </span>
                          </td>
                          <td data-label="Åtgärder" className="actions px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="flex items-center gap-2"
                                onClick={() => handleRegenerateInvite(invite.id)}
                              >
                                <RefreshCcw className="w-4 h-4" /> Ny länk
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="flex items-center gap-2"
                                onClick={() => handleCancelInvite(invite.id)}
                              >
                                Avbryt
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Modal open={openHandlerModal} onClose={() => setOpenHandlerModal(false)}>
            <div className="w-full max-w-lg p-4 sm:p-6 lg:p-8 bg-white rounded-lg sm:rounded-2xl shadow-lg">
              <h2 className="text-base sm:text-lg lg:text-xl font-semibold mb-4">Bjud in ny behandlare</h2>
              <p className="text-sm text-gray-500 mb-4">Personen anger sitt namn själv vid registrering.</p>
              <div className="flex flex-col gap-4">
                <label className="text-sm font-medium text-gray-700">E-postadress</label>
                <input
                  type="email"
                  className={`border rounded px-3 py-2 ${handlerErrors.email ? 'border-red-500' : ''}`}
                  value={newHandler.email}
                  onChange={e => {
                    setNewHandler({ ...newHandler, email: e.target.value });
                    setHandlerErrors(prev => ({ ...prev, email: undefined }));
                  }}
                  placeholder="Mail"
                />
                {handlerErrors.email && <span className="text-red-500 text-xs mt-1">{handlerErrors.email}</span>}
                <label className="text-sm font-medium text-gray-700">Roll</label>
                <select
                  className={`border rounded px-3 py-2 ${handlerErrors.role ? 'border-red-500' : ''}`}
                  value={newHandler.role}
                  onChange={e => {
                    const role = e.target.value;
                    setNewHandler({ ...newHandler, role });
                    setHandlerErrors(prev => ({ ...prev, role: undefined }));
                  }}
                >
                  <option value="handler">Behandlare</option>
                  <option value="admin">Admin</option>
                </select>
                {handlerErrors.role && <span className="text-red-500 text-xs mt-1">{handlerErrors.role}</span>}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-end mt-6">
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => {
                  setOpenHandlerModal(false);
                  setNewHandler({ email: "", role: "handler" });
                  setHandlerErrors({});
                }}>Avbryt</Button>
                <Button
                  variant="default"
                  className="w-full sm:w-auto"
                  onClick={handleAddHandler}
                  disabled={!!handlerErrors.email || !!handlerErrors.role || !newHandler.email || !newHandler.role}
                >
                  Spara
                </Button>
              </div>
            </div>
          </Modal>
          <Modal open={openEditHandlerModal} onClose={() => setOpenEditHandlerModal(false)}>
            <div className="w-full max-w-lg p-4 sm:p-6 lg:p-8 bg-white rounded-lg sm:rounded-2xl shadow-lg">
              <h2 className="text-base sm:text-lg lg:text-xl font-semibold mb-4">Redigera behandlare</h2>
              <div className="flex flex-col gap-4">
                <label className="text-sm font-medium text-gray-700">Namn</label>
                <input
                  type="text"
                  className="border rounded px-3 py-2"
                  value={editHandler?.name || ""}
                  onChange={e => setEditHandler(editHandler ? { ...editHandler, name: e.target.value } : null)}
                  placeholder="Namn"
                />
                <label className="text-sm font-medium text-gray-700">Mail</label>
                <input
                  type="email"
                  className="border rounded px-3 py-2"
                  value={editHandler?.email || ""}
                  onChange={e => setEditHandler(editHandler ? { ...editHandler, email: e.target.value } : null)}
                  placeholder="Mail"
                />
                
                {/* Lösenordsåterställning */}
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full text-sm"
                    onClick={() => {
                      if (editHandler) {
                        generatePasswordResetLink(editHandler.id, editHandler.email);
                      }
                    }}
                  >
                    🔐 Skicka återställningslänk för glömt lösenord
                  </Button>
                  <p className="text-xs text-gray-500 mt-1">
                    Genererar en unik länk som du kan skicka till behandlaren
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-between mt-6">
                <Button
                  variant="destructive"
                  className="w-full sm:w-auto"
                  onClick={async () => {
                    if (editHandler) {
                      try {
                        const res = await api(`/handlers/${editHandler.id}/deactivate`, { method: "PUT" });
                        if (!res.ok) throw new Error();
                        setOpenEditHandlerModal(false);
                        fetchHandlers();
                      } catch {
                        toast.error("Kunde inte avaktivera behandlare");
                      }
                    }
                  }}
                >
                  Radera
                </Button>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <Button variant="outline" className="w-full sm:w-auto" onClick={() => setOpenEditHandlerModal(false)}>Avbryt</Button>
                  <Button
                    variant="default"
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      if (editHandler) {
                        try {
                          const res = await api(`/handlers/${editHandler.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ name: editHandler.name, email: editHandler.email })
                          });
                          if (!res.ok) throw new Error();
                          setOpenEditHandlerModal(false);
                          fetchHandlers();
                        } catch {
                          toast.error("Kunde inte spara behandlare");
                        }
                      }
                    }}
                  >
                    Spara
                  </Button>
                </div>
              </div>
            </div>
          </Modal>
          {/* Popup för lösenordsåterställning */}
          {resetPasswordToken && (
            <div className="fixed top-4 right-4 sm:top-8 sm:right-8 bg-white border border-blue-400 shadow-lg rounded-lg p-3 sm:p-4 lg:p-6 z-50 max-w-sm sm:max-w-md">
              <div className="mb-4">
                <div className="font-semibold text-blue-700 text-sm sm:text-base lg:text-lg mb-2">🔐 Lösenordsåterställning skapad!</div>
                <div className="text-sm text-gray-600 mb-4">
                  Skicka följande information till behandlaren:
                </div>
              </div>



              {/* Återställningslänk */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🔗 Återställningslänk
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <input
                    className="w-full border rounded px-2 py-2 text-sm"
                    value={resetPasswordToken}
                    readOnly
                    onFocus={e => e.target.select()}
                  />
                  <button
                    className="bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700 w-full sm:w-auto"
                    onClick={() => {
                      navigator.clipboard.writeText(resetPasswordToken);
                      setResetPasswordCopied(true);
                      setTimeout(() => setResetPasswordCopied(false), 2000);
                    }}
                  >
                    Kopiera
                  </button>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Denna länk går ut om 1 timme
                </div>
              </div>

              {/* Status */}
              {resetPasswordCopied && (
                <div className="text-green-600 text-sm text-center mb-3">
                  Kopierat till urklipp!
                </div>
              )}

              <div className="text-center">
                <button
                  className="text-gray-500 underline text-sm"
                  onClick={() => setResetPasswordToken(null)}
                >
                  Stäng
                </button>
              </div>
            </div>
          )}

          {inviteToken && (
            <div className="fixed top-4 right-4 sm:top-8 sm:right-8 bg-white border border-green-400 shadow-lg rounded-lg p-3 sm:p-4 lg:p-6 z-50 max-w-sm sm:max-w-md">
              <div className="mb-4">
                <div className="font-semibold text-green-700 text-sm sm:text-base lg:text-lg mb-2">🎉 Inbjudan skapad!</div>
                <div className="text-sm text-gray-600 mb-4">
                  Skicka följande information till användaren:
                </div>
              </div>

              {/* Verifieringskod */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Verifieringskod
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <input
                    className="w-full border rounded px-3 py-2 font-mono text-lg tracking-widest text-center bg-gray-50"
                    value={inviteVerificationCode || "Laddar..."}
                    readOnly
                    onFocus={e => e.target.select()}
                  />
                  <button
                    className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 w-full sm:w-auto"
                    onClick={() => {
                      if (inviteVerificationCode) {
                        navigator.clipboard.writeText(inviteVerificationCode);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }
                    }}
                  >
                    Kopiera
                  </button>
                </div>
              </div>

              {/* Invite-länk */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Inbjudningslänk
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <input
                    className="w-full border rounded px-2 py-2 text-sm"
                    value={`${window.location.origin}/invite/${inviteToken}`}
                    readOnly
                    onFocus={e => e.target.select()}
                  />
                  <button
                    className="bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700 w-full sm:w-auto"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/invite/${inviteToken}`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    Kopiera
                  </button>
                </div>
              </div>

              <div className="text-xs text-gray-500 mb-4">
                Både koden och länken går ut om 7 dagar.
              </div>

              {/* Status */}
              {copied && (
                <div className="text-green-600 text-sm text-center mb-3">
                  Kopierat till urklipp!
                </div>
              )}

              <div className="text-center">
                <button
                  className="text-gray-500 underline text-sm"
                  onClick={() => setInviteToken(null)}
                >
                  Stäng
                </button>
              </div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="logg">
          <Card className="flex-1 bg-white border border-gray-200 rounded-lg sm:rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] mt-4 sm:mt-6">
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <AuditLog />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-4 text-xs text-gray-400 text-center">
        Tenant: {tenant.municipalityName} ({tenant.municipalityCode})
      </div>

      </div>
    </Layout>
  );
};
