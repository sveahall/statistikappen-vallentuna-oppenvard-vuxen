import { useEffect, useRef, useCallback } from 'react';

const hasDisabledProperty = (element: HTMLElement): element is HTMLElement & { disabled: boolean } =>
  'disabled' in element;

// Keyboard navigation hook
export const useKeyboardNavigation = () => {
  const focusableElements = useRef<HTMLElement[]>([]);
  
  // Hitta alla fokuserbara element
  const updateFocusableElements = useCallback(() => {
    const elements = document.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
    ) as NodeListOf<HTMLElement>;
    
    focusableElements.current = Array.from(elements).filter(el =>
      el.offsetParent !== null && // Synlig
      !(hasDisabledProperty(el) && el.disabled) && // Inte inaktiverad
      el.style.display !== 'none' // Inte dold
    );
  }, []);

  // Fokusera på första elementet
  const focusFirst = useCallback(() => {
    if (focusableElements.current.length > 0) {
      focusableElements.current[0].focus();
    }
  }, []);

  // Fokusera på sista elementet
  const focusLast = useCallback(() => {
    if (focusableElements.current.length > 0) {
      focusableElements.current[focusableElements.current.length - 1].focus();
    }
  }, []);

  // Fokusera på nästa element
  const focusNext = useCallback(() => {
    const currentIndex = focusableElements.current.findIndex(el => el === document.activeElement);
    if (currentIndex >= 0 && currentIndex < focusableElements.current.length - 1) {
      focusableElements.current[currentIndex + 1].focus();
    } else if (focusableElements.current.length > 0) {
      focusableElements.current[0].focus(); // Wrap till början
    }
  }, []);

  // Fokusera på föregående element
  const focusPrevious = useCallback(() => {
    const currentIndex = focusableElements.current.findIndex(el => el === document.activeElement);
    if (currentIndex > 0) {
      focusableElements.current[currentIndex - 1].focus();
    } else if (focusableElements.current.length > 0) {
      focusableElements.current[focusableElements.current.length - 1].focus(); // Wrap till slutet
    }
  }, []);

  // Fokusera på specifikt element
  const focusElement = useCallback((element: HTMLElement) => {
    if (focusableElements.current.includes(element)) {
      element.focus();
    }
  }, []);

  // Fokusera på element med specifikt attribut
  const focusByAttribute = useCallback((attribute: string, value: string) => {
    const element = document.querySelector(`[${attribute}="${value}"]`) as HTMLElement;
    if (element && focusableElements.current.includes(element)) {
      element.focus();
    }
  }, []);

  // Uppdatera fokuserbara element när DOM ändras
  useEffect(() => {
    updateFocusableElements();
    
    // Lyssna på DOM-ändringar
    const observer = new MutationObserver(updateFocusableElements);
    observer.observe(document.body, { 
      childList: true, 
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden']
    });

    return () => observer.disconnect();
  }, [updateFocusableElements]);

  return {
    focusFirst,
    focusLast,
    focusNext,
    focusPrevious,
    focusElement,
    focusByAttribute,
    updateFocusableElements,
  };
};

// Hook för att hantera Enter/Space på fokuserbara element
export const useKeyboardActions = () => {
  const handleKeyDown = useCallback((event: KeyboardEvent, actions: {
    onEnter?: () => void;
    onSpace?: () => void;
    onEscape?: () => void;
    onTab?: () => void;
    onArrowUp?: () => void;
    onArrowDown?: () => void;
    onArrowLeft?: () => void;
    onArrowRight?: () => void;
  }) => {
    switch (event.key) {
      case 'Enter':
        if (actions.onEnter) {
          event.preventDefault();
          actions.onEnter();
        }
        break;
      case ' ':
        if (actions.onSpace) {
          event.preventDefault();
          actions.onSpace();
        }
        break;
      case 'Escape':
        if (actions.onEscape) {
          event.preventDefault();
          actions.onEscape();
        }
        break;
      case 'Tab':
        if (actions.onTab) {
          actions.onTab();
        }
        break;
      case 'ArrowUp':
        if (actions.onArrowUp) {
          event.preventDefault();
          actions.onArrowUp();
        }
        break;
      case 'ArrowDown':
        if (actions.onArrowDown) {
          event.preventDefault();
          actions.onArrowDown();
        }
        break;
      case 'ArrowLeft':
        if (actions.onArrowLeft) {
          event.preventDefault();
          actions.onArrowLeft();
        }
        break;
      case 'ArrowRight':
        if (actions.onArrowRight) {
          event.preventDefault();
          actions.onArrowRight();
        }
        break;
    }
  }, []);

  return { handleKeyDown };
};

// Hook för att hantera fokus-trap i modaler
export const useFocusTrap = (isActive: boolean) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>;
    
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        if (event.shiftKey) {
          // Shift + Tab
          if (document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab
          if (document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    container.addEventListener('keydown', handleTabKey);
    
    // Fokusera på första elementet när modalen öppnas
    firstElement.focus();

    return () => {
      container.removeEventListener('keydown', handleTabKey);
    };
  }, [isActive]);

  return containerRef;
};

// Utility för att kontrollera om element är synligt
export const isElementVisible = (element: HTMLElement): boolean => {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && 
         style.visibility !== 'hidden' && 
         style.opacity !== '0' &&
         element.offsetParent !== null;
};

// Utility för att hitta nästa synliga element
export const findNextVisibleElement = (currentElement: HTMLElement): HTMLElement | null => {
  const allElements = Array.from(document.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )) as HTMLElement[];
  
  const currentIndex = allElements.indexOf(currentElement);
  if (currentIndex === -1) return null;

  // Leta efter nästa synliga element
  for (let i = currentIndex + 1; i < allElements.length; i++) {
    if (isElementVisible(allElements[i])) {
      return allElements[i];
    }
  }

  // Wrap till början
  for (let i = 0; i < currentIndex; i++) {
    if (isElementVisible(allElements[i])) {
      return allElements[i];
    }
  }

  return null;
};
