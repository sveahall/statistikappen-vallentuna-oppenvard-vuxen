import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  text, 
  className = '' 
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      <Loader2 className={`${sizeClasses[size]} animate-spin text-blue-600`} />
      {text && (
        <span className="text-sm text-gray-600">{text}</span>
      )}
    </div>
  );
};

// Skeleton loader för innehåll
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

// Skeleton för kort
export const CardSkeleton: React.FC = () => (
  <div className="bg-white rounded-lg p-6 shadow-sm">
    <Skeleton className="h-6 w-3/4 mb-4" />
    <Skeleton className="h-4 w-1/2 mb-2" />
    <Skeleton className="h-4 w-2/3" />
  </div>
);

// Skeleton för tabell
export const TableSkeleton: React.FC = () => (
  <div className="bg-white rounded-lg shadow-sm">
    <div className="p-6">
      <Skeleton className="h-6 w-1/3 mb-4" />
    </div>
    <div className="border-t">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="p-4 border-b last:border-b-0">
          <div className="flex gap-4">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/6" />
          </div>
        </div>
      ))}
    </div>
  </div>
);
