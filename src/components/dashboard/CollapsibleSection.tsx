import { LucideIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSectionCollapse } from '@/hooks/useSectionCollapse';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  id: string;
  title: string;
  icon?: LucideIcon;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function CollapsibleSection({
  id,
  title,
  icon: Icon,
  defaultOpen = true,
  children,
  className,
}: CollapsibleSectionProps) {
  const { isOpen, toggle } = useSectionCollapse(id, defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={toggle} className={className}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 w-full py-2 px-1 text-left",
            "hover:bg-muted/50 rounded-lg transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          {Icon && <Icon className="h-5 w-5 text-muted-foreground" />}
          <span className="font-semibold text-sm">{title}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
