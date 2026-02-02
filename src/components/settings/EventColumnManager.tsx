import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useEventDisplayColumns, EventDisplayColumn } from '@/hooks/useEventDisplayColumns';
import { Columns, Plus, Trash2, Pencil, Check, X, Database, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const SUGGESTED_FIELDS = [
  { key: 'utm_content', label: 'UTM Content', source: 'booking_metadata' },
  { key: 'utm_term', label: 'UTM Term', source: 'booking_metadata' },
  { key: 'utm_channel', label: 'UTM Channel', source: 'booking_metadata' },
];

export function EventColumnManager() {
  const { 
    columns, 
    isLoading, 
    updateVisibility, 
    updateLabel, 
    addColumn, 
    deleteColumn,
    isUpdating,
    isAdding,
    isDeleting,
  } = useEventDisplayColumns();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const handleStartEdit = (column: EventDisplayColumn) => {
    setEditingId(column.id);
    setEditLabel(column.display_label);
  };

  const handleSaveEdit = (id: string) => {
    if (editLabel.trim()) {
      updateLabel({ id, display_label: editLabel.trim() });
    }
    setEditingId(null);
    setEditLabel('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditLabel('');
  };

  const handleAddColumn = () => {
    if (newFieldKey.trim() && newFieldLabel.trim()) {
      addColumn({
        field_key: newFieldKey.trim().toLowerCase().replace(/\s+/g, '_'),
        display_label: newFieldLabel.trim(),
        field_source: 'booking_metadata',
      });
      setNewFieldKey('');
      setNewFieldLabel('');
      setShowAddForm(false);
    }
  };

  const handleAddSuggested = (key: string, label: string, source: string) => {
    addColumn({ field_key: key, display_label: label, field_source: source });
  };

  // Check which suggested fields aren't already added
  const availableSuggestions = SUGGESTED_FIELDS.filter(
    sf => !columns.some(c => c.field_key === sf.key)
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Columns className="h-5 w-5" />
          Event Table Columns
        </CardTitle>
        <CardDescription>
          Configure which UTM and booking metadata fields appear as columns in the Events table.
          These fields are extracted from your booking platform (Cal.com, Calendly).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current columns */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Configured Columns</Label>
          
          {columns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No columns configured yet. Add columns below.
            </p>
          ) : (
            <div className="space-y-2">
              {columns.map((column) => (
                <div 
                  key={column.id}
                  className={cn(
                    "flex items-center justify-between gap-3 p-3 rounded-lg border",
                    column.is_visible ? "bg-card" : "bg-muted/50"
                  )}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Switch
                      checked={column.is_visible}
                      onCheckedChange={(checked) => updateVisibility({ id: column.id, is_visible: checked })}
                      disabled={isUpdating}
                    />
                    
                    {editingId === column.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className="h-8"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(column.id);
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                        />
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8"
                          onClick={() => handleSaveEdit(column.id)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8"
                          onClick={handleCancelEdit}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={cn(
                          "font-medium truncate",
                          !column.is_visible && "text-muted-foreground"
                        )}>
                          {column.display_label}
                        </span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {column.field_source === 'booking_metadata' ? (
                            <Database className="h-3 w-3 mr-1" />
                          ) : (
                            <FileText className="h-3 w-3 mr-1" />
                          )}
                          {column.field_key}
                        </Badge>
                      </div>
                    )}
                  </div>
                  
                  {editingId !== column.id && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleStartEdit(column)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteColumn(column.id)}
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick add suggestions */}
        {availableSuggestions.length > 0 && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Suggested Fields</Label>
            <div className="flex flex-wrap gap-2">
              {availableSuggestions.map((field) => (
                <Button
                  key={field.key}
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddSuggested(field.key, field.label, field.source)}
                  disabled={isAdding}
                  className="gap-1"
                >
                  <Plus className="h-3 w-3" />
                  {field.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Add custom column */}
        <div className="space-y-3 pt-4 border-t">
          <Label className="text-sm font-medium">Add Custom Column</Label>
          
          {showAddForm ? (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Field Key</Label>
                  <Input
                    placeholder="e.g. utm_custom"
                    value={newFieldKey}
                    onChange={(e) => setNewFieldKey(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Display Label</Label>
                  <Input
                    placeholder="e.g. Custom UTM"
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    className="h-9"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddColumn();
                    }}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  size="sm"
                  onClick={handleAddColumn}
                  disabled={!newFieldKey.trim() || !newFieldLabel.trim() || isAdding}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Column
                </Button>
                <Button 
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewFieldKey('');
                    setNewFieldLabel('');
                  }}
                >
                  Cancel
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The field key should match the key in your booking platform's UTM parameters or custom fields.
              </p>
            </div>
          ) : (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Custom Field
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
