import { ReactNode } from "react";
import { ErrorBoundary as ReactErrorBoundary, FallbackProps } from "react-error-boundary";
import { logger } from "./logger";

interface Props {
  children: ReactNode;
}

const ErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => (
  <div className="min-h-screen flex items-center justify-center bg-[#f5f7fa] p-6">
    <div className="max-w-sm bg-white rounded-xl shadow-lg p-6 text-center space-y-4">
      <p className="text-red-600 font-semibold text-lg">Ett oväntat fel uppstod</p>
      <p className="text-gray-600 text-sm">
        Appen kunde inte visa innehållet. Försök igen eller ladda om sidan.
      </p>
      <div className="flex justify-center gap-2">
        <button
          className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium disabled:opacity-70"
          onClick={resetErrorBoundary}
        >
          Försök igen
        </button>
      </div>
      {import.meta.env.DEV && (
        <pre className="text-xs text-left bg-gray-100 p-3 rounded overflow-auto">
          {error?.message}
        </pre>
      )}
    </div>
  </div>
);

export const ErrorBoundary = ({ children }: Props) => (
  <ReactErrorBoundary
    onError={(error, info) => logger.error("ErrorBoundary captured error", error, info)}
    FallbackComponent={ErrorFallback}
  >
    {children}
  </ReactErrorBoundary>
);
