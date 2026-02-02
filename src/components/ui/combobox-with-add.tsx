import * as React from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface ComboboxWithAddProps {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ id: string; name: string }>;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  addNewText?: string;
  onAddNew?: (name: string) => Promise<string | null>; // Returns new ID or null if failed
  className?: string;
}

export function ComboboxWithAdd({
  value,
  onValueChange,
  options,
  placeholder = 'Select option...',
  searchPlaceholder = 'Search...',
  emptyText = 'No results found.',
  addNewText = 'Add new',
  onAddNew,
  className,
}: ComboboxWithAddProps) {
  const [open, setOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  const selectedOption = options.find((opt) => opt.id === value);

  const filteredOptions = options.filter((opt) =>
    opt.name.toLowerCase().includes(searchValue.toLowerCase())
  );

  const showAddNew = onAddNew && searchValue.trim() && !filteredOptions.length;

  const handleAddNew = async () => {
    if (!onAddNew || !searchValue.trim()) return;

    setCreating(true);
    try {
      const newId = await onAddNew(searchValue.trim());
      if (newId) {
        onValueChange(newId);
        setSearchValue('');
        setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between', className)}
        >
          {selectedOption ? selectedOption.name : value === '_none_' ? 'None' : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <CommandGroup>
              <CommandItem
                value="_none_"
                onSelect={() => {
                  onValueChange('_none_');
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === '_none_' ? 'opacity-100' : 'opacity-0'
                  )}
                />
                None
              </CommandItem>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.id}
                  onSelect={() => {
                    onValueChange(option.id);
                    setOpen(false);
                    setSearchValue('');
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === option.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {option.name}
                </CommandItem>
              ))}
            </CommandGroup>

            {showAddNew && (
              <CommandGroup>
                <CommandItem
                  onSelect={handleAddNew}
                  disabled={creating}
                  className="text-primary"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {creating ? 'Adding...' : `${addNewText} "${searchValue}"`}
                </CommandItem>
              </CommandGroup>
            )}

            {!showAddNew && filteredOptions.length === 0 && (
              <CommandEmpty>{emptyText}</CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
