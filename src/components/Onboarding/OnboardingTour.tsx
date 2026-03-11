import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { Button } from '@/components/ui/button';

type Rect = { top: number; left: number; width: number; height: number } | null;

function getElementRect(selector?: string): Rect {
  if (!selector) return null;
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

export const OnboardingTour: React.FC = () => {
  const { active, stepIndex, steps, next, prev, skip, complete } = useOnboarding();
  const step = steps[stepIndex];

  const [targetRect, setTargetRect] = useState<Rect>(null);
  const [waiting, setWaiting] = useState(false);
  const pollRef = useRef<number | null>(null);

  // Poll for target element when step changes
  useEffect(() => {
    if (!active) return;
    const initId = requestAnimationFrame(() => {
      setWaiting(false);
      setTargetRect(null);
    });

    // Immediate attempt
    const immediate = getElementRect(step.selector);
    if (immediate) {
      const immediateFrame = requestAnimationFrame(() => setTargetRect(immediate));
      return () => {
        cancelAnimationFrame(immediateFrame);
        cancelAnimationFrame(initId);
      };
    }

    // Poll up to 2 seconds for dynamic content
    let waitingId: number | null = null;
    waitingId = requestAnimationFrame(() => setWaiting(true));
    let elapsed = 0;
    const start = performance.now();
    const poll = () => {
      const rect = getElementRect(step.selector);
      if (rect) {
        setTargetRect(rect);
        setWaiting(false);
        if (pollRef.current) cancelAnimationFrame(pollRef.current);
        pollRef.current = null;
        return;
      }
      elapsed = performance.now() - start;
      if (elapsed < 2000) {
        pollRef.current = requestAnimationFrame(poll);
      } else {
        setWaiting(false);
        pollRef.current = null;
      }
    };
    pollRef.current = requestAnimationFrame(poll);
    return () => {
      if (pollRef.current) cancelAnimationFrame(pollRef.current);
      pollRef.current = null;
      cancelAnimationFrame(initId);
      if (waitingId) cancelAnimationFrame(waitingId);
    };
  }, [active, stepIndex, step?.selector]);

  // Recalculate on resize/scroll
  useEffect(() => {
    if (!active) return;
    const handler = () => setTargetRect(getElementRect(step.selector));
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [active, step?.selector]);

  const overlay = useMemo(() => {
    if (!active) return null;
    // Highlight rectangle styles
    const highlightStyle: React.CSSProperties | undefined = targetRect
      ? {
          position: 'fixed',
          top: `${targetRect.top - 6}px`,
          left: `${targetRect.left - 6}px`,
          width: `${targetRect.width + 12}px`,
          height: `${targetRect.height + 12}px`,
          borderRadius: '10px',
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0), 0 0 0 2px var(--tenant-brand-ring)',
          pointerEvents: 'none',
          transition: 'all 120ms ease',
          zIndex: 10000,
        }
      : undefined;

    // Tooltip positioning
    let ttTop = window.innerHeight / 2 - 120;
    let ttLeft = window.innerWidth / 2 - 180;
    if (targetRect && step.placement && step.placement !== 'center') {
      const margin = 12;
      if (step.placement === 'top') {
        ttTop = clamp(targetRect.top - 200 - margin, 12, window.innerHeight - 180);
        ttLeft = clamp(targetRect.left + targetRect.width / 2 - 180, 12, window.innerWidth - 360);
      } else if (step.placement === 'bottom') {
        ttTop = clamp(targetRect.top + targetRect.height + margin, 12, window.innerHeight - 180);
        ttLeft = clamp(targetRect.left + targetRect.width / 2 - 180, 12, window.innerWidth - 360);
      } else if (step.placement === 'left') {
        ttTop = clamp(targetRect.top + targetRect.height / 2 - 100, 12, window.innerHeight - 180);
        ttLeft = clamp(targetRect.left - 360 - margin, 12, window.innerWidth - 360);
      } else if (step.placement === 'right') {
        ttTop = clamp(targetRect.top + targetRect.height / 2 - 100, 12, window.innerHeight - 180);
        ttLeft = clamp(targetRect.left + targetRect.width + margin, 12, window.innerWidth - 360);
      }
    }

    const progress = `${stepIndex + 1} / ${steps.length}`;

    return (
      <div className="fixed inset-0 z-[9999]">
        {/* Dim background */}
        <div className="absolute inset-0 bg-black/45" />

        {/* Highlight rectangle if available */}
        {targetRect && <div style={highlightStyle} />}

        {/* Tooltip card */}
        <div
          className="absolute bg-white rounded-xl shadow-xl p-4 sm:p-5 max-w-[360px] w-[90vw]"
          style={{ top: `${ttTop}px`, left: `${ttLeft}px` }}
        >
          <div className="text-sm text-gray-500 mb-1">Steg {progress}</div>
          <div className="text-lg font-semibold text-[var(--tenant-brand)]">{step.title}</div>
          <p className="mt-2 text-gray-700 text-sm leading-relaxed">{step.description}</p>

          <div className="mt-4 flex flex-wrap gap-2 justify-end">
            <Button variant="outline" onClick={skip}>Hoppa över</Button>
            {stepIndex > 0 && (
              <Button variant="outline" onClick={prev}>Föregående</Button>
            )}
            {step.action && step.action.type === 'click-selector' && step.action.selector && (
              <Button
                variant="outline"
                onClick={() => {
                  const el = document.querySelector(step.action!.selector!) as HTMLElement | null;
                  if (el) el.click();
                }}
              >
                {step.action.label}
              </Button>
            )}
            {stepIndex < steps.length - 1 ? (
              <Button variant="default" className="bg-[var(--tenant-brand)] hover:bg-[var(--tenant-brand-hover)]" onClick={next}>Nästa</Button>
            ) : (
              <Button variant="default" className="bg-[var(--tenant-brand)] hover:bg-[var(--tenant-brand-hover)]" onClick={complete}>Avsluta</Button>
            )}
          </div>
        </div>

        {/* Optional waiting hint if selector not found */}
        {step.selector && !targetRect && waiting && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm opacity-80">
            Letar efter element för detta steg...
          </div>
        )}
      </div>
    );
  }, [active, step, stepIndex, steps.length, targetRect, waiting, next, prev, skip, complete]);

  if (!active) return null;
  return overlay;
};
