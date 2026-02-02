import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Calendar } from 'lucide-react';

interface BookingPlatformBadgeProps {
  platform: 'calendly' | 'calcom' | string | null | undefined;
  className?: string;
  animate?: boolean;
}

export function BookingPlatformBadge({ platform, className, animate = true }: BookingPlatformBadgeProps) {
  if (!platform) return null;
  
  const config = {
    calendly: {
      label: 'Calendly',
      className: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
      glowColor: 'shadow-blue-500/40',
    },
    calcom: {
      label: 'Cal.com',
      className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
      glowColor: 'shadow-emerald-500/40',
    },
  }[platform] || {
    label: platform,
    className: 'bg-muted text-muted-foreground border-border',
    glowColor: '',
  };

  return (
    <Badge 
      variant="outline" 
      className={cn(
        config.className, 
        animate && config.glowColor && 'animate-aura-pulse',
        className
      )}
    >
      <Calendar className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}
