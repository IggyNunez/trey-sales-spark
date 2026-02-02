import { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDragScroll } from '@/hooks/useDragScroll';

interface DraggableTableWrapperProps {
  children: ReactNode;
  dependencies?: unknown[];
  className?: string;
}

/**
 * A wrapper component that adds drag-to-scroll functionality to tables.
 * Use this around any table that needs horizontal scrolling with drag support.
 */
export function DraggableTableWrapper({ 
  children, 
  dependencies = [],
  className 
}: DraggableTableWrapperProps) {
  const {
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
  } = useDragScroll(dependencies);

  return (
    <div className={cn("relative group", className)}>
      {/* Left scroll button */}
      {canScrollLeft && (
        <button
          onClick={scrollLeft}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-full px-2 bg-gradient-to-r from-card via-card/80 to-transparent opacity-60 hover:opacity-100 transition-opacity flex items-center"
          aria-label="Scroll left"
          data-no-drag="true"
        >
          <div className="rounded-full bg-muted/90 p-1.5 shadow-sm border">
            <ChevronLeft className="h-4 w-4" />
          </div>
        </button>
      )}
      
      {/* Right scroll button */}
      {canScrollRight && (
        <button
          onClick={scrollRight}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-full px-2 bg-gradient-to-l from-card via-card/80 to-transparent opacity-60 hover:opacity-100 transition-opacity flex items-center"
          aria-label="Scroll right"
          data-no-drag="true"
        >
          <div className="rounded-full bg-muted/90 p-1.5 shadow-sm border">
            <ChevronRight className="h-4 w-4" />
          </div>
        </button>
      )}
      
      <div 
        ref={scrollContainerRef} 
        className={cn(
          "overflow-x-auto touch-pan-y",
          isDragging ? "cursor-grabbing select-none" : "cursor-grab"
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerCancel}
        onClickCapture={handleClick}
      >
        {children}
      </div>
    </div>
  );
}
