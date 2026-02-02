import { Sparkles, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface UpdateBannerProps {
  title: string;
  description: string;
  onDismiss: () => void;
  onViewUpdates: () => void;
}

export function UpdateBanner({ title, description, onDismiss, onViewUpdates }: UpdateBannerProps) {
  return (
    <div 
      className={cn(
        "relative flex items-center justify-between gap-4 px-4 py-3",
        "bg-gradient-to-r from-primary via-primary/90 to-primary/80",
        "text-primary-foreground",
        "animate-in slide-in-from-top-2 duration-300"
      )}
    >
      <button
        onClick={onViewUpdates}
        className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-90 transition-opacity"
      >
        <Sparkles className="h-5 w-5 shrink-0" />
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold truncate">{title}</span>
          <span className="hidden sm:inline text-primary-foreground/80">·</span>
          <span className="hidden sm:inline text-primary-foreground/80 truncate">{description}</span>
          <ArrowRight className="h-4 w-4 shrink-0 ml-1" />
        </div>
      </button>
      
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
