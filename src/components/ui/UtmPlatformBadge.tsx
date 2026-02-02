import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getCanonicalSource } from '@/lib/trafficSourceNormalization';

interface UtmPlatformBadgeProps {
  platform: string | null | undefined;
  size?: 'sm' | 'default';
  className?: string;
  /** If true, displays the canonical name instead of the raw value */
  showCanonical?: boolean;
}

// Style mapping uses canonical names (lowercase) as keys
const platformStyles: Record<string, string> = {
  instagram: 'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-950 dark:text-pink-300 dark:border-pink-800',
  x: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  facebook: 'bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800',
  linkedin: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  youtube: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  tiktok: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
  newsletter: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  organic: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  referral: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800',
  podcast: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800',
};

export function UtmPlatformBadge({ platform, size = 'default', className, showCanonical = false }: UtmPlatformBadgeProps) {
  if (!platform) {
    return null;
  }

  // Get the canonical name for consistent styling
  const canonicalPlatform = getCanonicalSource(platform);
  const normalizedForStyle = canonicalPlatform.toLowerCase();
  const styleClass = platformStyles[normalizedForStyle] || '';
  
  // Display either the canonical name or the original value
  const displayText = showCanonical ? canonicalPlatform : platform;

  return (
    <Badge 
      variant="outline" 
      className={cn(
        styleClass || 'bg-muted text-muted-foreground',
        size === 'sm' && 'text-[10px] px-1.5 py-0',
        className
      )}
    >
      {displayText}
    </Badge>
  );
}
