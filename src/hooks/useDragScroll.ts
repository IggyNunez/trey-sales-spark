import { useRef, useState, useCallback, useEffect } from 'react';

interface DragScrollState {
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  isDragging: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  scrollLeft: () => void;
  scrollRight: () => void;
  handlePointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerUp: () => void;
  handlePointerCancel: () => void;
  handleClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * Hook for drag-to-scroll functionality on horizontal scrollable containers.
 * Returns refs, handlers, and state for implementing drag scrolling.
 */
export function useDragScroll(dependencies: unknown[] = []): DragScrollState {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const dragRef = useRef<{
    isDown: boolean;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
    pointerId: number | null;
    justFinishedDrag: boolean;
    captured: boolean;
  }>({ isDown: false, startX: 0, startScrollLeft: 0, moved: false, pointerId: null, justFinishedDrag: false, captured: false });

  const DRAG_THRESHOLD_PX = 4;

  const updateScrollButtons = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      setCanScrollLeft(container.scrollLeft > 0);
      setCanScrollRight(
        container.scrollLeft < container.scrollWidth - container.clientWidth - 1
      );
    }
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Initial measurement after layout
    requestAnimationFrame(updateScrollButtons);

    // Listen for scroll
    container.addEventListener('scroll', updateScrollButtons);
    window.addEventListener('resize', updateScrollButtons);

    // ResizeObserver for robust overflow detection
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(updateScrollButtons);
    });
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', updateScrollButtons);
      window.removeEventListener('resize', updateScrollButtons);
      resizeObserver.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateScrollButtons, ...dependencies]);

  const scrollLeft = useCallback(() => {
    scrollContainerRef.current?.scrollBy({ left: -300, behavior: 'smooth' });
  }, []);

  const scrollRight = useCallback(() => {
    scrollContainerRef.current?.scrollBy({ left: 300, behavior: 'smooth' });
  }, []);

  const stopDrag = useCallback(() => {
    const container = scrollContainerRef.current;
    const pointerId = dragRef.current.pointerId;

    // Track if we just finished a real drag (moved beyond threshold)
    dragRef.current.justFinishedDrag = dragRef.current.moved;
    
    dragRef.current.isDown = false;
    dragRef.current.pointerId = null;
    dragRef.current.moved = false;
    dragRef.current.captured = false;
    setIsDragging(false);

    if (container && pointerId != null) {
      try {
        container.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Reset the justFinishedDrag flag on new pointer down
    dragRef.current.justFinishedDrag = false;
    
    // Left click only for mouse; allow touch/pen
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    // Don't start drag if clicking on a button or interactive element
    if (
      (e.target as HTMLElement).closest(
        'button, a, input, textarea, select, [role="button"], [data-no-drag="true"]'
      )
    ) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) return;
    
    // Only enable drag if there's horizontal overflow
    if (container.scrollWidth <= container.clientWidth + 1) return;

    // Just record the starting position - don't capture yet
    dragRef.current.isDown = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startScrollLeft = container.scrollLeft;
    dragRef.current.moved = false;
    dragRef.current.pointerId = e.pointerId;
    dragRef.current.captured = false;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    if (!container || !dragRef.current.isDown) return;

    const dx = e.clientX - dragRef.current.startX;
    
    // Haven't crossed threshold yet - don't capture or scroll
    if (!dragRef.current.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;

    // First time crossing threshold - now we capture and start dragging
    if (!dragRef.current.captured && dragRef.current.pointerId != null) {
      dragRef.current.captured = true;
      dragRef.current.moved = true;
      setIsDragging(true);
      try {
        container.setPointerCapture(dragRef.current.pointerId);
      } catch {
        // ignore
      }
    }

    container.scrollLeft = dragRef.current.startScrollLeft - dx;
  }, []);

  const handlePointerUp = useCallback(() => stopDrag(), [stopDrag]);
  const handlePointerCancel = useCallback(() => stopDrag(), [stopDrag]);
  
  // Click handler to prevent clicks after a drag
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current.justFinishedDrag) {
      e.stopPropagation();
      e.preventDefault();
      dragRef.current.justFinishedDrag = false;
    }
  }, []);

  return {
    scrollContainerRef,
    isDragging,
    canScrollLeft,
    canScrollRight,
    scrollLeft,
    scrollRight,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleClick,
  };
}
