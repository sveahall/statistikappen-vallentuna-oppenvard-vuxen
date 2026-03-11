import React from 'react';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { tenant } from '@/config/tenant';

export const Forbidden: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow p-8 max-w-md w-full text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <ShieldAlert className="w-7 h-7 text-red-600" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Åtkomst nekad</h1>
        <p className="text-gray-600 mb-6">Du har inte behörighet att visa denna sida. Kontakta en administratör om du behöver åtkomst.</p>
        <div className="flex gap-3 justify-center">
          <Button asChild variant="outline">
            <Link to="/dashboard">Till startsidan</Link>
          </Button>
          <Button asChild>
            <a href={`mailto:${tenant.supportEmail}?subject=${encodeURIComponent('Åtkomst nekad')}`}>
              Kontakta admin
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Forbidden;
