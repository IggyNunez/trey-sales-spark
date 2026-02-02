import { useState, useCallback } from 'react';

const STORAGE_KEY = 'dashboard_collapsed_sections';

/**
 * Hook for managing collapsible section state with localStorage persistence.
 * Stores an array of collapsed section IDs.
 */
export function useSectionCollapse(sectionId: string, defaultOpen = true) {
  const [isOpen, setIsOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const collapsed = JSON.parse(stored) as string[];
        return !collapsed.includes(sectionId);
      }
    } catch {
      // Ignore localStorage errors
    }
    return defaultOpen;
  });

  const toggle = useCallback(() => {
    setIsOpen(prev => {
      const newState = !prev;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const collapsed: string[] = stored ? JSON.parse(stored) : [];
        
        if (newState) {
          // Opening - remove from collapsed list
          const idx = collapsed.indexOf(sectionId);
          if (idx > -1) collapsed.splice(idx, 1);
        } else {
          // Closing - add to collapsed list
          if (!collapsed.includes(sectionId)) collapsed.push(sectionId);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsed));
      } catch {
        // Ignore localStorage errors
      }
      return newState;
    });
  }, [sectionId]);

  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const collapsed: string[] = stored ? JSON.parse(stored) : [];
      
      if (open) {
        const idx = collapsed.indexOf(sectionId);
        if (idx > -1) collapsed.splice(idx, 1);
      } else {
        if (!collapsed.includes(sectionId)) collapsed.push(sectionId);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsed));
    } catch {
      // Ignore localStorage errors
    }
  }, [sectionId]);

  return { isOpen, toggle, setOpen };
}
