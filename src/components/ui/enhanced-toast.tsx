import toast, { ToastOptions } from 'react-hot-toast';
import { CheckCircle, XCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';

// Förbättrade toast-typer med ikoner och styling
export const enhancedToast = {
  success: (message: string, options?: ToastOptions) => {
    return toast.success(message, {
      duration: 4000,
      icon: <CheckCircle className="w-5 h-5 text-green-600" />,
      style: {
        background: '#f0fdf4',
        color: '#166534',
        border: '1px solid #bbf7d0',
        borderRadius: '8px',
        padding: '12px 16px',
        fontSize: '14px',
        fontWeight: '500',
      },
      ...options,
    });
  },

  error: (message: string, options?: ToastOptions) => {
    return toast.error(message, {
      duration: 6000,
      icon: <XCircle className="w-5 h-5 text-red-600" />,
      style: {
        background: '#fef2f2',
        color: '#dc2626',
        border: '1px solid #fecaca',
        borderRadius: '8px',
        padding: '12px 16px',
        fontSize: '14px',
        fontWeight: '500',
      },
      ...options,
    });
  },

  warning: (message: string, options?: ToastOptions) => {
    return toast(message, {
      duration: 5000,
      icon: <AlertTriangle className="w-5 h-5 text-yellow-600" />,
      style: {
        background: '#fffbeb',
        color: '#d97706',
        border: '1px solid #fed7aa',
        borderRadius: '8px',
        padding: '12px 16px',
        fontSize: '14px',
        fontWeight: '500',
      },
      ...options,
    });
  },

  info: (message: string, options?: ToastOptions) => {
    return toast(message, {
      duration: 4000,
      icon: <Info className="w-5 h-5 text-blue-600" />,
      style: {
        background: '#eff6ff',
        color: '#2563eb',
        border: '1px solid #bfdbfe',
        borderRadius: '8px',
        padding: '12px 16px',
        fontSize: '14px',
        fontWeight: '500',
      },
      ...options,
    });
  },

  loading: (message: string, options?: ToastOptions) => {
    return toast.loading(message, {
      icon: <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />,
      style: {
        background: '#f8fafc',
        color: '#475569',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '12px 16px',
        fontSize: '14px',
        fontWeight: '500',
      },
      ...options,
    });
  },

  // Toast med progress bar
  progress: (message: string, progress: number, options?: ToastOptions) => {
    const toastId = toast.loading(message, {
      icon: <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />,
      style: {
        background: '#f8fafc',
        color: '#475569',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '12px 16px',
        fontSize: '14px',
        fontWeight: '500',
        minWidth: '300px',
      },
      ...options,
    });

    // Lägg till progress bar
    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
      width: 100%;
      height: 4px;
      background: #e2e8f0;
      border-radius: 2px;
      margin-top: 8px;
      overflow: hidden;
    `;
    
    const progressFill = document.createElement('div');
    progressFill.style.cssText = `
      height: 100%;
      background: #3b82f6;
      width: ${progress}%;
      transition: width 0.3s ease;
    `;
    
    progressBar.appendChild(progressFill);
    
    // Hitta toast-elementet och lägg till progress bar
    setTimeout(() => {
      const toastElement = document.querySelector(`[data-toast-id="${toastId}"]`);
      if (toastElement) {
        const content = toastElement.querySelector('[data-content]');
        if (content) {
          content.appendChild(progressBar);
        }
      }
    }, 100);

    return toastId;
  },

  // Toast med action-knappar
  action: (message: string, actions: { label: string; onClick: () => void }[], options?: ToastOptions) => {
    const toastId = toast(message, {
      duration: 10000,
      icon: <Info className="w-5 h-5 text-blue-600" />,
      style: {
        background: '#f8fafc',
        color: '#475569',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '12px 16px',
        fontSize: '14px',
        fontWeight: '500',
        minWidth: '350px',
      },
      ...options,
    });

    // Lägg till action-knappar
    setTimeout(() => {
      const toastElement = document.querySelector(`[data-toast-id="${toastId}"]`);
      if (toastElement) {
        const content = toastElement.querySelector('[data-content]');
        if (content) {
          const actionContainer = document.createElement('div');
          actionContainer.style.cssText = `
            display: flex;
            gap: 8px;
            margin-top: 12px;
          `;
          
          actions.forEach(({ label, onClick }) => {
            const button = document.createElement('button');
            button.textContent = label;
            button.style.cssText = `
              padding: 6px 12px;
              border: 1px solid #d1d5db;
              border-radius: 6px;
              background: white;
              color: #374151;
              font-size: 12px;
              cursor: pointer;
              transition: all 0.2s;
            `;
            
            button.addEventListener('mouseenter', () => {
              button.style.background = '#f3f4f6';
            });
            
            button.addEventListener('mouseleave', () => {
              button.style.background = 'white';
            });
            
            button.addEventListener('click', () => {
              onClick();
              toast.dismiss(toastId);
            });
            
            actionContainer.appendChild(button);
          });
          
          content.appendChild(actionContainer);
        }
      }
    }, 100);

    return toastId;
  },
};

// Exportera för enkel användning
export default enhancedToast;
