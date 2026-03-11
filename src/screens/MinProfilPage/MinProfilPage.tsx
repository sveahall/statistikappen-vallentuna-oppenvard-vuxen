import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getCustomers, getCases } from '../../lib/api';
import { Layout } from '../../components/Layout';
import { LogOut } from 'lucide-react';
import { Customer, CaseWithNames } from '../../types/types';
import { useRefresh } from '../../contexts/RefreshContext';
import { getRoleLabel } from "@/lib/roleLabels";
import type { User } from '../../contexts/AuthContext';

// Optimized customer row component with React.memo
const CustomerRow = React.memo<{
  customer: Customer;
  onViewProfile: (customerId: number) => void;
}>(({ customer, onViewProfile }) => {
  const isGroup = Boolean(customer.is_group || customer.isGroup);
  return (
    <tr className="hover:bg-gray-50 cursor-pointer">
      <td data-label="Kund-ID" className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{customer.id}</td>
      <td data-label="Initialer" className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-2">
        <span>{customer.initials}</span>
        {isGroup && <span className="inline-block px-2 py-0.5 text-[10px] rounded-full bg-blue-100 text-blue-700 uppercase">Grupp</span>}
      </td>
      <td data-label="Födelseår" className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{isGroup ? '—' : (customer.birth_year ?? '—')}</td>
      <td data-label="Status" className="px-6 py-4 whitespace-nowrap">
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          customer.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
        }`}>
          {customer.active ? 'Aktiv' : 'Inaktiv'}
        </span>
      </td>
      <td data-label="Åtgärd" className="actions px-6 py-4 whitespace-nowrap">
        <button 
          onClick={() => onViewProfile(customer.id)}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline"
        >
          Visa profil →
        </button>
      </td>
    </tr>
  );
});

// Optimized profile info component with React.memo
const ProfileInfo = React.memo<{
  user: User | null;
  onLogout: () => void;
}>(({ user, onLogout }) => (
  <div className="bg-white rounded-lg shadow p-6">
    <h2 className="text-xl font-semibold text-gray-900 mb-4">Profilinformation</h2>
    
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Namn</label>
        <p className="mt-1 text-sm text-gray-900">{user?.name}</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">E-post</label>
        <p className="mt-1 text-sm text-gray-900">{user?.email}</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Roll</label>
        <p className="mt-1 text-sm text-gray-900 capitalize">
          {getRoleLabel(user?.role) || (user?.role ?? '')}
        </p>
      </div>
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          Kontakta systemadministratören om du behöver ändra din profilinformation.
        </p>
      </div>
      <div className="mt-6 pt-4 border-t border-gray-200">
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 hover:border-red-300 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Logga ut
        </button>
      </div>
    </div>
  </div>
));

// Optimized customers table component with React.memo
const CustomersTable = React.memo<{
  customers: Customer[];
  onViewProfile: (customerId: number) => void;
}>(({ customers, onViewProfile }) => (
  <div className="bg-white rounded-lg shadow">
    <div className="px-6 py-4 border-b border-gray-200">
      <h2 className="text-xl font-semibold text-gray-900">Mina kunder</h2>
    </div>
    <div className="p-6">
      {customers.length > 0 ? (
        <div className="tablet:overflow-x-auto overflow-visible">
          <table className="responsive-table divide-y divide-gray-200 tablet:min-w-[640px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kund-ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Initialer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Födelseår</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Åtgärd</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {customers.map((customer) => (
                <CustomerRow 
                  key={customer.id} 
                  customer={customer} 
                  onViewProfile={onViewProfile}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-500 text-center py-4">Inga kunder tillgängliga</p>
      )}
    </div>
  </div>
));

CustomerRow.displayName = 'CustomerRow';
ProfileInfo.displayName = 'ProfileInfo';
CustomersTable.displayName = 'CustomersTable';

const MinProfilPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { refreshKey } = useRefresh();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cases, setCases] = useState<CaseWithNames[]>([]);
  const [loading, setLoading] = useState(true);

  // Memoized callback functions to prevent unnecessary re-renders
  const handleViewProfile = useCallback((customerId: number) => {
    window.location.href = `/kunder/${customerId}`;
  }, []);

  const handleLogout = useCallback(() => {
    logout();
  }, [logout]);

  // Memoized data processing to avoid recalculating on every render
  const userCases = useMemo(() => {
    if (!user) return [];
    return cases.filter(c => 
      c.handler1_id === user.id || c.handler2_id === user.id
    );
  }, [cases, user]);

  const userCustomers = useMemo(() => {
    if (!user) return [];
    const userCustomerIds = [...new Set(userCases.map(c => c.customer_id))];
    return customers.filter(c => userCustomerIds.includes(c.id));
  }, [customers, userCases, user]);

  const fetchUserData = useCallback(async () => {
    if (!user) return;
    try {
      // Hämta användarens kunder och insatsen
      const [customersRes, casesRes] = await Promise.all([
        getCustomers(),
        getCases()
      ]);
      
      // Filtrera kunder baserat på användarens insatsen
      const userCases = casesRes.filter(c => 
        c.handler1_id === user?.id || c.handler2_id === user?.id
      );
      
      // Hämta kunder för användarens insatsen
      const userCustomerIds = [...new Set(userCases.map(c => c.customer_id))];
      const userCustomers = customersRes.filter(c => userCustomerIds.includes(c.id));
      
      // Filtrera insatsen för den inloggade användaren
      const userCasesFiltered = casesRes.filter(c => 
        c.handler1_id === user?.id || c.handler2_id === user?.id
      );
      
      setCustomers(userCustomers);
      setCases(userCasesFiltered);
    } catch (error) {
      console.error('Fel vid hämtning av data:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Laddar...</div>
      </div>
    );
  }

  return (
    <Layout title="Min Profil">
      <div className="w-full py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profilinformation */}
          <div className="lg:col-span-1">
            <ProfileInfo user={user} onLogout={handleLogout} />
          </div>

          {/* Huvudinnehåll */}
          <div className="lg:col-span-2 space-y-6">
            {/* Mina kunder */}
            <CustomersTable customers={userCustomers} onViewProfile={handleViewProfile} />
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default MinProfilPage;
