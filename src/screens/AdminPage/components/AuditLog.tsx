import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { DateRangePicker } from '../../../components/ui/date-range-picker';
import { toast } from 'react-hot-toast';
import { Search, Filter, Download, Trash2, RefreshCw } from 'lucide-react';
import { api } from '../../../lib/apiClient';
import { useRefresh } from '@/contexts/RefreshContext';

type AuditLogDetails = Record<string, unknown> | string | null;

interface AuditLogEntry {
  id: number;
  user_id: number | null;
  username: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  entity_name: string | null;
  details: AuditLogDetails;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface AuditLogResponse {
  logs: AuditLogEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

const AuditLog: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const { refreshKey, triggerRefresh } = useRefresh();
  
  // Filter states
  const [search, setSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState<string | undefined>(undefined);
  const [selectedEntityType, setSelectedEntityType] = useState<string | undefined>(undefined);
  const [selectedUsername, setSelectedUsername] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });

  // Actions och entity types för filter
  const actions = ['LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'ACCESS', 'CLEANUP'];
  const entityTypes = ['user', 'customer', 'case', 'shift', 'effort', 'handler', 'data', 'audit_log'];

  const loadAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pagination.page.toString());
      params.append('limit', pagination.limit.toString());
      
      if (search) params.append('search', search);
      if (selectedAction && selectedAction !== 'all') params.append('action', selectedAction);
      if (selectedEntityType && selectedEntityType !== 'all') params.append('entityType', selectedEntityType);
      if (selectedUsername) params.append('username', selectedUsername);
      if (dateRange.from) params.append('from', dateRange.from.toISOString());
      if (dateRange.to) params.append('to', dateRange.to.toISOString());

      const response = await api(`/audit?${params.toString()}`);

      if (!response.ok) throw new Error('Kunde inte hämta audit log');
      
      const data: AuditLogResponse = await response.json();
      setLogs(data.logs);
      setPagination(prev => ({ ...prev, ...data.pagination }));
    } catch (error) {
      toast.error('Kunde inte hämta audit log');
      console.error('Error loading audit logs:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange, pagination.limit, pagination.page, search, selectedAction, selectedEntityType, selectedUsername]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs, pagination.page, pagination.limit, refreshKey]);

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    loadAuditLogs();
  };

  const handleClearFilters = () => {
    setSearch('');
    setSelectedAction(undefined);
    setSelectedEntityType(undefined);
    setSelectedUsername(undefined);
    setDateRange({ from: null, to: null });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleCleanup = async () => {
    if (!confirm('Är du säker på att du vill rensa gamla loggar? Detta kan inte ångras.')) return;
    
    try {
      const response = await api('/audit/cleanup', {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Kunde inte rensa gamla loggar');
      
      toast.success('Gamla loggar rensade');
      loadAuditLogs();
      triggerRefresh();
    } catch (error) {
      toast.error('Kunde inte rensa gamla loggar');
      console.error('Error cleaning up logs:', error);
    }
  };

  const exportLogs = () => {
    const csvContent = [
      ['ID', 'Användare', 'Åtgärd', 'Entitetstyp', 'Entitetsnamn', 'Detaljer', 'IP-adress', 'Datum'],
      ...logs.map(log => [
        log.id.toString(),
        log.username,
        log.action,
        log.entity_type,
        log.entity_name || '',
        JSON.stringify(log.details),
        log.ip_address || '',
        new Date(log.created_at).toLocaleString('sv-SE')
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const formatDetails = (details: AuditLogEntry['details']): string => {
    if (!details) return '';
    
    try {
      if (typeof details === 'string') {
        const parsed = JSON.parse(details);
        return Object.entries(parsed)
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
          .join(', ');
      }
      return Object.entries(details)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join(', ');
    } catch {
      return String(details);
    }
  };

  const getActionColor = (action: string): string => {
    switch (action) {
      case 'CREATE': return 'bg-green-100 text-green-800';
      case 'UPDATE': return 'bg-blue-100 text-blue-800';
      case 'DELETE': return 'bg-red-100 text-red-800';
      case 'LOGIN': return 'bg-purple-100 text-purple-800';
      case 'LOGOUT': return 'bg-gray-100 text-gray-800';
      case 'EXPORT': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Granskningslogg
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filter Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 tablet:gap-6 mb-6">
            <div className="space-y-3">
              <label className="text-sm font-medium">Sök</label>
              <Input
                placeholder="Sök i alla fält..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            
            <div className="space-y-3">
              <label className="text-sm font-medium">Åtgärd</label>
              <Select value={selectedAction} onValueChange={setSelectedAction}>
                <SelectTrigger>
                  <SelectValue placeholder="Alla åtgärder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla åtgärder</SelectItem>
                  {actions.map(action => (
                    <SelectItem key={action} value={action}>{action}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-3">
              <label className="text-sm font-medium">Entitetstyp</label>
              <Select value={selectedEntityType} onValueChange={setSelectedEntityType}>
                <SelectTrigger>
                  <SelectValue placeholder="Alla typer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla typer</SelectItem>
                  {entityTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-3">
              <label className="text-sm font-medium">Användare</label>
              <Input
                placeholder="Användarnamn..."
                value={selectedUsername}
                onChange={(e) => setSelectedUsername(e.target.value)}
              />
            </div>
          </div>

          {/* Date Range */}
          <div className="mb-6">
            <label className="text-sm font-medium block mb-2">Tidsperiod</label>
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 mb-6">
            <Button onClick={handleSearch} disabled={loading}>
              <Search className="h-4 w-4 mr-2" />
              Sök
            </Button>
            
            <Button variant="outline" onClick={handleClearFilters}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Rensa filter
            </Button>
            
            <Button variant="outline" onClick={exportLogs}>
              <Download className="h-4 w-4 mr-2" />
              Exportera CSV
            </Button>
            
            <Button variant="destructive" onClick={handleCleanup}>
              <Trash2 className="h-4 w-4 mr-2" />
              Rensa gamla loggar
            </Button>
          </div>

          {/* Results Info */}
          <div className="text-sm text-gray-600 mb-4">
            Visar {logs.length} av {pagination.total} loggar (sida {pagination.page} av {pagination.pages})
          </div>

          {/* Logs Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-2 text-left text-sm font-medium">Datum</th>
                  <th className="border border-gray-200 px-3 py-2 text-left text-sm font-medium">Användare</th>
                  <th className="border border-gray-200 px-3 py-2 text-left text-sm font-medium">Åtgärd</th>
                  <th className="border border-gray-200 px-3 py-2 text-left text-sm font-medium">Entitet</th>
                  <th className="border border-gray-200 px-3 py-2 text-left text-sm font-medium">Detaljer</th>
                  <th className="border border-gray-200 px-3 py-2 text-left text-sm font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="border border-gray-200 px-3 py-2 text-sm">
                      {new Date(log.created_at).toLocaleString('sv-SE')}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-sm font-medium">
                      {log.username}
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-sm">
                      <div>
                        <div className="font-medium">{log.entity_type}</div>
                        {log.entity_name && (
                          <div className="text-gray-500 text-xs">{log.entity_name}</div>
                        )}
                      </div>
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-sm">
                      <div className="max-w-xs truncate" title={formatDetails(log.details)}>
                        {formatDetails(log.details)}
                      </div>
                    </td>
                    <td className="border border-gray-200 px-3 py-2 text-sm text-gray-500">
                      {log.ip_address || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page <= 1}
              >
                Föregående
              </Button>
              
              <span className="text-sm">
                Sida {pagination.page} av {pagination.pages}
              </span>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page >= pagination.pages}
              >
                Nästa
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuditLog;
