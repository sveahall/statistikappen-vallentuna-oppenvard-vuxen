import React from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const Modal = ({ open, onClose, children }: ModalProps) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/30 px-4 py-6 sm:p-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:w-auto max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-4rem)] md:max-w-[calc(100vw-6rem)] lg:max-w-[calc(100vw-8rem)] max-h-[calc(100vh-4rem)] sm:max-h-[calc(100vh-6rem)] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};
