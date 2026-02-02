import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, Search, Database, Filter, LayoutGrid, Check, Play } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCloseFieldMappings,
  useDiscoverCloseFields,
  useSaveCloseFieldMappings,
  useUpdateCloseFieldMapping,
  usePreviewCloseField,
  DiscoveredField,
} from '@/hooks/useCloseFields';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from 'sonner';

const FIELD_TYPE_COLORS: Record<string, string> = {
  text: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  number: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  choices: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  user: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  date: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  datetime: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  contact: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
};

export function CloseFieldManager() {
  const [discoveredFields, setDiscoveredFields] = useState<DiscoveredField[]>([]);
  const [localChanges, setLocalChanges] = useState<Record<string, Partial<DiscoveredField & { is_synced?: boolean; show_in_filters?: boolean; show_in_dashboard?: boolean }>>>({});
  const [previewEmail, setPreviewEmail] = useState('');
  const [previewData, setPreviewData] = useState<any>(null);
  const [isSyncingEvents, setIsSyncingEvents] = useState(false);
  
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();

  const { data: savedMappings, isLoading: loadingMappings } = useCloseFieldMappings();
  const discoverMutation = useDiscoverCloseFields();
  const saveMutation = useSaveCloseFieldMappings();
  const updateMutation = useUpdateCloseFieldMapping();
  const previewMutation = usePreviewCloseField();
  
  const handleSyncEvents = async () => {
    if (!currentOrganization?.id) {
      toast.error('No organization selected');
      return;
    }
    
    setIsSyncingEvents(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-close-events', {
        body: { organizationId: currentOrganization.id, background: true },
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      toast.success('Events sync started', {
        description: 'Close custom fields are being synced to your events. Refresh in a few moments.',
      });

      // Immediately invalidate cached filter option queries so Dashboard dropdowns refresh
      queryClient.invalidateQueries({ queryKey: ['close-field-distinct-values'] });
    } catch (err) {
      toast.error('Failed to sync events', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsSyncingEvents(false);
    }
  };

  const handleDiscover = async () => {
    const fields = await discoverMutation.mutateAsync();
    setDiscoveredFields(fields);
    
    // Initialize local changes with existing values
    const initial: Record<string, any> = {};
    fields.forEach((field) => {
      if (field.existing) {
        initial[field.close_field_id] = {
          is_synced: field.existing.is_synced,
          show_in_filters: field.existing.show_in_filters,
          show_in_dashboard: field.existing.show_in_dashboard,
        };
      }
    });
    setLocalChanges(initial);
  };

  const handleToggle = (fieldId: string, key: 'is_synced' | 'show_in_filters' | 'show_in_dashboard', value: boolean) => {
    setLocalChanges((prev) => ({
      ...prev,
      [fieldId]: {
        ...prev[fieldId],
        [key]: value,
      },
    }));
  };

  // Use displayFields (which merges discovered + saved) so edits to already-saved fields work
  const displayFields = discoveredFields.length > 0 ? discoveredFields : (savedMappings || []).map(m => ({
    close_field_id: m.close_field_id,
    close_field_name: m.close_field_name,
    close_field_type: m.close_field_type,
    close_field_choices: m.close_field_choices,
    existing: {
      is_synced: m.is_synced,
      show_in_filters: m.show_in_filters,
      show_in_dashboard: m.show_in_dashboard,
    },
  }));

  const handleSaveAll = async () => {
    // Only save fields that have changes OR are already synced
    const fieldsToSave = displayFields
      .filter((field) => {
        const changes = localChanges[field.close_field_id];
        // Include if there are local changes or if the field was already configured
        return changes || field.existing?.is_synced || field.existing?.show_in_filters || field.existing?.show_in_dashboard;
      })
      .map((field, index) => ({
        ...field,
        is_synced: localChanges[field.close_field_id]?.is_synced ?? field.existing?.is_synced ?? false,
        show_in_filters: localChanges[field.close_field_id]?.show_in_filters ?? field.existing?.show_in_filters ?? false,
        show_in_dashboard: localChanges[field.close_field_id]?.show_in_dashboard ?? field.existing?.show_in_dashboard ?? false,
        sort_order: index,
      }));

    if (fieldsToSave.length === 0) {
      return;
    }
    
    await saveMutation.mutateAsync(fieldsToSave);
  };

  const handlePreview = async () => {
    if (!previewEmail.trim()) return;
    const lead = await previewMutation.mutateAsync(previewEmail.trim());
    setPreviewData(lead);
  };

  const hasUnsavedChanges = Object.keys(localChanges).length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Close CRM Custom Fields
            </CardTitle>
            <CardDescription>
              Discover and configure which Close CRM custom fields to sync and display
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDiscover}
              disabled={discoverMutation.isPending}
            >
              {discoverMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Discover Fields
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncEvents}
              disabled={isSyncingEvents}
            >
              {isSyncingEvents ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Sync to Events
            </Button>
            {hasUnsavedChanges && (
              <Button
                size="sm"
                onClick={handleSaveAll}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Preview Section */}
        <div className="border rounded-lg p-4 bg-muted/30">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <Search className="h-4 w-4" />
            Preview Field Values
          </h4>
          <p className="text-sm text-muted-foreground mb-3">
            Enter an email to see what custom field values exist for that lead in Close
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="customer@example.com"
              value={previewEmail}
              onChange={(e) => setPreviewEmail(e.target.value)}
              className="max-w-sm"
            />
            <Button
              variant="secondary"
              onClick={handlePreview}
              disabled={previewMutation.isPending || !previewEmail.trim()}
            >
              {previewMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Preview'
              )}
            </Button>
          </div>
          {previewData && (
            <div className="mt-4 p-3 bg-background rounded border text-sm">
              <p className="font-medium">{previewData.display_name || 'Unknown Lead'}</p>
              {previewData.custom_fields && Object.keys(previewData.custom_fields).length > 0 ? (
                <div className="mt-2 space-y-1">
                  {Object.entries(previewData.custom_fields).map(([fieldId, value]) => {
                    const fieldDef = displayFields.find(f => f.close_field_id === fieldId);
                    return (
                      <div key={fieldId} className="flex justify-between">
                        <span className="text-muted-foreground">
                          {fieldDef?.close_field_name || fieldId}:
                        </span>
                        <span className="font-mono">{String(value) || '(empty)'}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground mt-2">No custom fields found</p>
              )}
            </div>
          )}
          {previewData === null && previewMutation.isSuccess && (
            <p className="mt-3 text-sm text-muted-foreground">No lead found with that email</p>
          )}
        </div>

        {/* Fields List */}
        {loadingMappings && displayFields.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : displayFields.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No custom fields discovered yet.</p>
            <p className="text-sm">Click "Discover Fields" to fetch available fields from Close CRM.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr,auto,auto,auto] gap-4 px-3 py-2 text-sm font-medium text-muted-foreground border-b">
              <span>Field Name</span>
              <span className="text-center w-20">
                <Database className="h-4 w-4 inline mr-1" />
                Sync
              </span>
              <span className="text-center w-20">
                <Filter className="h-4 w-4 inline mr-1" />
                Filter
              </span>
              <span className="text-center w-20">
                <LayoutGrid className="h-4 w-4 inline mr-1" />
                Show
              </span>
            </div>

            {displayFields.map((field) => {
              const changes = localChanges[field.close_field_id] || {};
              const isSynced = changes.is_synced ?? field.existing?.is_synced ?? false;
              const showInFilters = changes.show_in_filters ?? field.existing?.show_in_filters ?? false;
              const showInDashboard = changes.show_in_dashboard ?? field.existing?.show_in_dashboard ?? false;

              return (
                <div
                  key={field.close_field_id}
                  className="grid grid-cols-[1fr,auto,auto,auto] gap-4 items-center px-3 py-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium">{field.close_field_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="secondary"
                          className={cn('text-xs', FIELD_TYPE_COLORS[field.close_field_type] || '')}
                        >
                          {field.close_field_type}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">
                          {field.close_field_id}
                        </span>
                      </div>
                      {field.close_field_choices && field.close_field_choices.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Choices: {field.close_field_choices.slice(0, 3).join(', ')}
                          {field.close_field_choices.length > 3 && ` +${field.close_field_choices.length - 3} more`}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-center w-20">
                    <Switch
                      checked={isSynced}
                      onCheckedChange={(checked) => handleToggle(field.close_field_id, 'is_synced', checked)}
                    />
                  </div>

                  <div className="flex justify-center w-20">
                    <Switch
                      checked={showInFilters}
                      onCheckedChange={(checked) => handleToggle(field.close_field_id, 'show_in_filters', checked)}
                      disabled={!isSynced}
                    />
                  </div>

                  <div className="flex justify-center w-20">
                    <Switch
                      checked={showInDashboard}
                      onCheckedChange={(checked) => handleToggle(field.close_field_id, 'show_in_dashboard', checked)}
                      disabled={!isSynced}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="space-y-3 pt-4 border-t">
          <div className="p-3 bg-muted/40 rounded-lg text-sm">
            <p className="font-medium text-foreground mb-1">How to use Close filters:</p>
            <ol className="list-decimal list-inside text-muted-foreground space-y-1">
              <li>Enable "Sync" and "Filter" for the fields you want</li>
              <li>Click "Save Changes"</li>
              <li>Click "Sync to Events" to populate filter data from Close CRM</li>
              <li>Filters will appear in the Dashboard filter bar</li>
            </ol>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Database className="h-3 w-3" />
              <span>Sync: Pull values from Close during sync</span>
            </div>
            <div className="flex items-center gap-1">
              <Filter className="h-3 w-3" />
              <span>Filter: Show as dashboard filter</span>
            </div>
            <div className="flex items-center gap-1">
              <LayoutGrid className="h-3 w-3" />
              <span>Show: Display in events table</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
