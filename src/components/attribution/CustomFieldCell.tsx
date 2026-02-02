import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { CalendarIcon, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CustomFieldCellProps {
  fieldType: string;
  fieldId: string;
  appliesTo: string[];
  currentValue: string;
  options: { id: string; label: string; value: string }[];
  setters: { id: string; name: string }[];
  closers: { id: string; name: string }[];
  onUpdate: (fieldId: string, value: string) => void;
}

export function CustomFieldCell({
  fieldType,
  fieldId,
  appliesTo,
  currentValue,
  options,
  setters,
  closers,
  onUpdate,
}: CustomFieldCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(currentValue);
  const [dateOpen, setDateOpen] = useState(false);

  // Handle select type
  if (fieldType === 'select') {
    return (
      <Select
        value={currentValue || '_none_'}
        onValueChange={(v) => onUpdate(fieldId, v === '_none_' ? '' : v)}
      >
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue placeholder="-" />
        </SelectTrigger>
        <SelectContent className="bg-popover">
          <SelectItem value="_none_">-</SelectItem>
          {options.map(opt => (
            <SelectItem key={opt.id} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Handle user reference type
  if (fieldType === 'user') {
    const isClosersOnly = appliesTo.includes('user_ref:closers');
    const isSettersOnly = appliesTo.includes('user_ref:setters');
    const showBoth = appliesTo.includes('user_ref:all') || (!isClosersOnly && !isSettersOnly);
    
    const allUsers = showBoth
      ? [...setters.map(s => ({ ...s, type: 'Setter' as const })), ...closers.map(c => ({ ...c, type: 'Closer' as const }))]
      : isClosersOnly
        ? closers.map(c => ({ ...c, type: 'Closer' as const }))
        : setters.map(s => ({ ...s, type: 'Setter' as const }));
    
    const displayValue = allUsers.find(u => u.id === currentValue)?.name || '';
    
    return (
      <Select
        value={currentValue || '_none_'}
        onValueChange={(v) => onUpdate(fieldId, v === '_none_' ? '' : v)}
      >
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue placeholder="-">
            {displayValue || '-'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-popover max-h-[300px]">
          <SelectItem value="_none_">-</SelectItem>
          {showBoth ? (
            <>
              {setters.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Setters</div>
                  {setters.map(user => (
                    <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                  ))}
                </>
              )}
              {closers.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Closers</div>
                  {closers.map(user => (
                    <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                  ))}
                </>
              )}
            </>
          ) : (
            allUsers.map(user => (
              <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    );
  }

  // Handle text type - inline editable
  if (fieldType === 'text') {
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="h-7 w-[100px] text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onUpdate(fieldId, editValue);
                setIsEditing(false);
              } else if (e.key === 'Escape') {
                setEditValue(currentValue);
                setIsEditing(false);
              }
            }}
            onBlur={() => {
              onUpdate(fieldId, editValue);
              setIsEditing(false);
            }}
          />
        </div>
      );
    }
    return (
      <button
        onClick={() => setIsEditing(true)}
        className={cn(
          "text-xs text-left px-2 py-1 rounded hover:bg-muted/50 min-w-[60px]",
          !currentValue && "text-muted-foreground"
        )}
      >
        {currentValue || '-'}
      </button>
    );
  }

  // Handle number type - inline editable
  if (fieldType === 'number') {
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="h-7 w-[80px] text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onUpdate(fieldId, editValue);
                setIsEditing(false);
              } else if (e.key === 'Escape') {
                setEditValue(currentValue);
                setIsEditing(false);
              }
            }}
            onBlur={() => {
              onUpdate(fieldId, editValue);
              setIsEditing(false);
            }}
          />
        </div>
      );
    }
    return (
      <button
        onClick={() => setIsEditing(true)}
        className={cn(
          "text-xs text-left px-2 py-1 rounded hover:bg-muted/50 min-w-[40px]",
          !currentValue && "text-muted-foreground"
        )}
      >
        {currentValue || '-'}
      </button>
    );
  }

  // Handle date type
  if (fieldType === 'date') {
    const dateValue = currentValue ? new Date(currentValue) : undefined;
    const isValidDate = dateValue && !isNaN(dateValue.getTime());
    
    return (
      <Popover open={dateOpen} onOpenChange={setDateOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 px-2 text-xs font-normal justify-start",
              !isValidDate && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="h-3 w-3 mr-1" />
            {isValidDate ? format(dateValue, 'MMM d') : '-'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateValue}
            onSelect={(date) => {
              onUpdate(fieldId, date ? date.toISOString() : '');
              setDateOpen(false);
            }}
            initialFocus
          />
          {isValidDate && (
            <div className="p-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
                onClick={() => {
                  onUpdate(fieldId, '');
                  setDateOpen(false);
                }}
              >
                Clear date
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  // Fallback
  return <span className="text-muted-foreground text-sm">-</span>;
}
