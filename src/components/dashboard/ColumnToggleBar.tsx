import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useEventDisplayColumns, EventDisplayColumn } from '@/hooks/useEventDisplayColumns';
import { Plus, Columns, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const SUGGESTED_FIELDS = [
  { key: 'utm_content', label: 'UTM Content', source: 'booking_metadata' },
  { key: 'utm_term', label: 'UTM Term', source: 'booking_metadata' },
  { key: 'utm_channel', label: 'UTM Channel', source: 'booking_metadata' },
];

// These fields are already shown via hardcoded columns
const REDUNDANT_FIELDS = ['utm_platform', 'utm_setter'];

interface ColumnCoverage {
  hasData: boolean;
  count: number;
  total: number;
}

interface ColumnToggleBarProps {
  columnCoverage?: Record<string, ColumnCoverage>;
}

export function ColumnToggleBar({ columnCoverage }: ColumnToggleBarProps) {
  const { 
    columns, 
    isLoading, 
    updateVisibility, 
    addColumn,
    isAdding,
  } = useEventDisplayColumns();

  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [addPopoverOpen, setAddPopoverOpen] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  // Filter out redundant columns that are already shown as hardcoded columns
  const toggleableColumns = columns.filter(
    col => !REDUNDANT_FIELDS.includes(col.field_key)
  );

  // Split columns into active (has data or no coverage info) vs hidden (explicitly no data)
  const { activeColumns, hiddenColumns } = useMemo(() => {
    const active: EventDisplayColumn[] = [];
    const hidden: EventDisplayColumn[] = [];
    
    toggleableColumns.forEach(col => {
      const coverage = columnCoverage?.[col.field_key];
      // Hide if: has coverage data AND no events have this field AND user hasn't force-shown it
      if (coverage && !coverage.hasData && !col.is_visible) {
        hidden.push(col);
      } else {
        active.push(col);
      }
    });
    
    return { activeColumns: active, hiddenColumns: hidden };
  }, [toggleableColumns, columnCoverage]);

  // Suggestions not already added
  const availableSuggestions = SUGGESTED_FIELDS.filter(
    sf => !columns.some(c => c.field_key === sf.key)
  );

  const handleToggle = (id: string, currentVisibility: boolean) => {
    updateVisibility({ id, is_visible: !currentVisibility });
  };

  const handleAddSuggested = (key: string, label: string, source: string) => {
    addColumn({ field_key: key, display_label: label, field_source: source });
  };

  const handleAddCustom = () => {
    if (newFieldKey.trim() && newFieldLabel.trim()) {
      addColumn({
        field_key: newFieldKey.trim().toLowerCase().replace(/\s+/g, '_'),
        display_label: newFieldLabel.trim(),
        field_source: 'booking_metadata',
      });
      setNewFieldKey('');
      setNewFieldLabel('');
      setAddPopoverOpen(false);
    }
  };

  const handleForceShow = (id: string) => {
    updateVisibility({ id, is_visible: true });
  };

  if (isLoading) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Columns className="h-4 w-4" />
        <span className="text-sm font-medium">Columns:</span>
      </div>
      
      {activeColumns.length === 0 && hiddenColumns.length === 0 ? (
        <span className="text-sm text-muted-foreground">No custom columns</span>
      ) : (
        activeColumns.map(col => (
          <Badge
            key={col.id}
            variant={col.is_visible ? "default" : "outline"}
            className={cn(
              "cursor-pointer transition-colors select-none",
              col.is_visible 
                ? "hover:bg-primary/80" 
                : "hover:bg-muted text-muted-foreground"
            )}
            onClick={() => handleToggle(col.id, col.is_visible)}
          >
            {col.is_visible ? (
              <Eye className="h-3 w-3 mr-1" />
            ) : (
              <EyeOff className="h-3 w-3 mr-1" />
            )}
            {col.display_label}
          </Badge>
        ))
      )}
      
      <Popover open={addPopoverOpen} onOpenChange={setAddPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2 gap-1">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="start">
          <div className="space-y-4">
            {/* Quick suggestions */}
            {availableSuggestions.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Quick Add</Label>
                <div className="flex flex-wrap gap-1.5">
                  {availableSuggestions.map((field) => (
                    <Badge
                      key={field.key}
                      variant="outline"
                      className="cursor-pointer hover:bg-accent"
                      onClick={() => handleAddSuggested(field.key, field.label, field.source)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {field.label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {/* Custom field form */}
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-xs font-medium text-muted-foreground">Custom Field</Label>
              <div className="space-y-2">
                <Input
                  placeholder="Field key (e.g. utm_custom)"
                  value={newFieldKey}
                  onChange={(e) => setNewFieldKey(e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Display label"
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  className="h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddCustom();
                  }}
                />
                <Button 
                  size="sm" 
                  className="w-full"
                  onClick={handleAddCustom}
                  disabled={!newFieldKey.trim() || !newFieldLabel.trim() || isAdding}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Column
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Hidden columns notice */}
      {hiddenColumns.length > 0 && (
        <Collapsible open={showHidden} onOpenChange={setShowHidden}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground"
            >
              <EyeOff className="h-3.5 w-3.5" />
              <span className="text-xs">
                {hiddenColumns.length} hidden (no data)
              </span>
              <ChevronDown className={cn(
                "h-3.5 w-3.5 transition-transform",
                showHidden && "rotate-180"
              )} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="flex flex-wrap gap-1.5 pl-4 border-l-2 border-muted">
              {hiddenColumns.map(col => {
                const coverage = columnCoverage?.[col.field_key];
                return (
                  <Badge 
                    key={col.id} 
                    variant="outline" 
                    className="text-muted-foreground gap-1.5"
                  >
                    <span>{col.display_label}</span>
                    <span className="text-[10px] opacity-70">
                      (0/{coverage?.total ?? 0})
                    </span>
                    <button 
                      onClick={() => handleForceShow(col.id)}
                      className="ml-1 text-[10px] underline hover:no-underline opacity-70 hover:opacity-100"
                    >
                      Show
                    </button>
                  </Badge>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
