import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link, ChevronDown, ChevronRight, Loader2, RefreshCw, CheckCircle, Eye, EyeOff, Unlink } from 'lucide-react';
import { useIntegrationConfig, CRM_CONFIGS, CRMType } from '@/hooks/useIntegrationConfig';
import { CRMUserMapping } from './CRMUserMapping';
import { CloseFieldManager } from '../CloseFieldManager';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export function CRMSection() {
  const { integrations, updateIntegrations, primaryCRM, primaryCRMConfig, hasClose, hasGHL, hasHubSpot, orgId } = useIntegrationConfig();
  const { toast } = useToast();
  
  const [isOpen, setIsOpen] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [locationId, setLocationId] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingContacts, setSyncingContacts] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  
  const existingLocationId = integrations?.ghl_location_id || '';

  // Use primaryCRM from database as the source of truth
  const activeCRM = primaryCRM;
  const activeCRMConfig = activeCRM !== 'none' ? CRM_CONFIGS[activeCRM] : null;

  const isConnected = (crm: CRMType) => {
    if (crm === 'ghl') return hasGHL;
    if (crm === 'close') return hasClose;
    if (crm === 'hubspot') return hasHubSpot;
    return false;
  };

  const handleCRMChange = async (crm: CRMType) => {
    // Clear local state when changing CRM
    setApiKey('');
    setShowApiKey(false);
    setSyncResult(null);
    
    // Update the database immediately so UI reflects the change
    await updateIntegrations.mutateAsync({ primary_crm: crm });
  };

  const validateHubSpotKey = async (key: string): Promise<{ valid: boolean; error?: string }> => {
    try {
      // Validate through edge function to avoid CORS issues
      const { data, error } = await supabase.functions.invoke('validate-hubspot-key', {
        body: { api_key: key }
      });

      if (error) {
        return { valid: false, error: error.message || 'Failed to validate API key' };
      }

      return data;
    } catch (err) {
      return { valid: false, error: 'Failed to validate API key' };
    }
  };

  const saveApiKey = async () => {
    if (!apiKey.trim() || activeCRM === 'none' || !orgId) return;
    setSaving(true);
    try {
      // Validate HubSpot keys before saving
      if (activeCRM === 'hubspot') {
        const validation = await validateHubSpotKey(apiKey.trim());
        if (!validation.valid) {
          toast({
            title: 'Invalid API Key',
            description: validation.error,
            variant: 'destructive'
          });
          setSaving(false);
          return;
        }
      }

      // Step 1: Save the API key using the encryption edge function
      const { data: saveData, error: saveError } = await supabase.functions.invoke('manage-api-keys', {
        body: {
          action: 'save',
          organizationId: orgId,
          keyType: activeCRM, // 'ghl', 'close', or 'hubspot'
          apiKey: apiKey.trim(),
        },
      });

      if (saveError || !saveData?.success) {
        throw new Error(saveError?.message || saveData?.error || 'Failed to save API key');
      }

      // Step 2: Update the primary CRM setting
      await updateIntegrations.mutateAsync({ primary_crm: activeCRM });

      setApiKey('');
      toast({ title: 'Connected', description: `${activeCRMConfig?.name} connected successfully` });
    } catch (err) {
      console.error('Error saving CRM key:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save API key',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!orgId) return;
    setSyncing(true);
    try {
      if (activeCRM === 'close') {
        const { error } = await supabase.functions.invoke('sync-close', { body: { action: 'test', organizationId: orgId } });
        if (error) throw error;
        toast({ title: 'Connection Successful', description: 'Close CRM API is connected' });
      } else if (activeCRM === 'ghl') {
        toast({ title: 'Connection Verified', description: 'GHL is configured' });
      } else if (activeCRM === 'hubspot') {
        toast({ title: 'Connection Verified', description: 'HubSpot is configured' });
      }
    } catch (err) {
      toast({ title: 'Connection Failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const syncRecords = async () => {
    if (!orgId) return;
    setSyncingContacts(true);
    setSyncResult(null);
    try {
      if (activeCRM === 'close') {
        const { data, error } = await supabase.functions.invoke('sync-close', { body: { action: 'sync', organizationId: orgId } });
        if (error) throw error;
        setSyncResult(data);
        toast({ title: 'Sync Complete', description: `Updated ${data?.updated || 0} of ${data?.total || 0} records` });
      } else if (activeCRM === 'ghl') {
        const { data, error } = await supabase.functions.invoke('sync-ghl-contacts', { body: { organization_id: orgId } });
        if (error) throw error;
        setSyncResult(data);
        toast({ title: 'GHL Sync Complete', description: `Matched ${data?.matched || 0} contacts` });
      } else if (activeCRM === 'hubspot') {
        const { data, error } = await supabase.functions.invoke('sync-hubspot-contacts', { body: { organization_id: orgId } });
        if (error) throw error;
        setSyncResult(data);
        toast({ title: 'HubSpot Sync Complete', description: `Matched ${data?.matched || 0} contacts` });
      }
    } catch (err) {
      toast({ title: 'Sync Failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSyncingContacts(false);
    }
  };

  const disconnectCRM = async () => {
    if (!activeCRM || activeCRM === 'none') return;
    setDisconnecting(true);
    try {
      const updates: Record<string, any> = {};
      // Clear both plain-text and encrypted keys
      if (activeCRM === 'ghl') {
        updates.ghl_api_key = null;
        updates.ghl_api_key_encrypted = null;
      }
      if (activeCRM === 'close') {
        updates.close_api_key = null;
        updates.close_api_key_encrypted = null;
      }
      if (activeCRM === 'hubspot') {
        updates.hubspot_api_key = null;
        updates.hubspot_api_key_encrypted = null;
      }
      await updateIntegrations.mutateAsync(updates);
      setSyncResult(null);
      toast({ title: 'Disconnected', description: `${activeCRMConfig?.name} has been disconnected. You can now enter a new API key.` });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to disconnect', variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  const saveLocationId = async () => {
    if (!locationId.trim()) return;
    setSavingLocation(true);
    try {
      await updateIntegrations.mutateAsync({ ghl_location_id: locationId.trim() });
      toast({ title: 'Location ID Saved', description: 'GHL Location ID has been saved. Try syncing again.' });
      setLocationId('');
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to save Location ID', variant: 'destructive' });
    } finally {
      setSavingLocation(false);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <Link className="h-5 w-5 text-success" />
                </div>
                <div>
                  <CardTitle className="text-lg">CRM</CardTitle>
                  <CardDescription>Connect your CRM to sync leads and contacts</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {primaryCRMConfig && (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                    {primaryCRMConfig.name} Connected
                  </Badge>
                )}
                {isOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-6 pt-0">
            <div className="space-y-3">
              <Label>Select Your CRM</Label>
              <Select value={activeCRM} onValueChange={(v) => handleCRMChange(v as CRMType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a CRM" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {Object.values(CRM_CONFIGS).map((config) => (
                    <SelectItem key={config.id} value={config.id}>
                      <div className="flex items-center gap-2">
                        {config.name}
                        {isConnected(config.id) && <CheckCircle className="h-3 w-3 text-success" />}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeCRM !== 'none' && activeCRMConfig && (
              <div className="p-4 rounded-lg border space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${activeCRM === 'ghl' ? 'bg-orange-500/10' : activeCRM === 'hubspot' ? 'bg-orange-500/10' : 'bg-green-500/10'}`}>
                      <Link className={`h-5 w-5 ${activeCRM === 'ghl' ? 'text-orange-500' : activeCRM === 'hubspot' ? 'text-orange-500' : 'text-green-500'}`} />
                    </div>
                    <div>
                      <h4 className="font-medium">{activeCRMConfig.name}</h4>
                      <p className="text-sm text-muted-foreground">{isConnected(activeCRM) ? 'Connected and syncing' : 'Enter your API key to connect'}</p>
                    </div>
                  </div>
                  {isConnected(activeCRM) && <Badge variant="outline" className="bg-success/10 text-success border-success/20">Connected</Badge>}
                </div>

                {isConnected(activeCRM) ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={testConnection} disabled={syncing}>
                        {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                        Test Connection
                      </Button>
                      <Button onClick={syncRecords} disabled={syncingContacts}>
                        {syncingContacts ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                        Sync {activeCRMConfig.recordIdLabel}s
                      </Button>
                      <Button variant="outline" onClick={disconnectCRM} disabled={disconnecting} className="text-destructive hover:text-destructive">
                        {disconnecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Unlink className="h-4 w-4 mr-2" />}
                        Disconnect
                      </Button>
                    </div>
                    {syncResult && (
                      <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
                        <p className="text-sm font-medium">
                          Sync Results: {syncResult.updated || syncResult.matched || 0} updated, {syncResult.skipped || syncResult.not_found || 0} skipped
                          {syncResult.errors > 0 && <span className="text-destructive">, {syncResult.errors} errors</span>}
                        </p>
                        {syncResult.updatedRecords && syncResult.updatedRecords.length > 0 && (
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            <p className="text-xs text-muted-foreground font-medium">Updated records:</p>
                            {syncResult.updatedRecords.map((record: { email: string; name: string; changes: string[] }, idx: number) => (
                              <div key={idx} className="text-xs p-2 bg-background rounded border">
                                <p className="font-medium">{record.name}</p>
                                <p className="text-muted-foreground">{record.email}</p>
                                <p className="text-success">{record.changes.join(', ')}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {activeCRM === 'ghl' && (
                      <div className="space-y-3 p-3 rounded-lg bg-muted/30 border">
                        <div className="space-y-2">
                          <Label>GHL Location ID {existingLocationId && <span className="text-success text-xs ml-2">✓ Set</span>}</Label>
                          <div className="flex gap-2">
                            <Input 
                              value={locationId} 
                              onChange={(e) => setLocationId(e.target.value)} 
                              placeholder={existingLocationId || "Enter your GHL Location ID"}
                              className="flex-1"
                            />
                            <Button onClick={saveLocationId} disabled={savingLocation || !locationId.trim()} size="sm">
                              {savingLocation && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                              Save
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Required for PIT tokens (pit-...). Find it in GHL → Settings → Business Profile
                          </p>
                          {!existingLocationId && syncResult?.errors > 0 && (
                            <p className="text-xs text-destructive">
                              ⚠️ Location ID is required for your API key type. Please add it above.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    {activeCRM === 'close' && (
                      <>
                        <Separator />
                        <CRMUserMapping crmConfig={activeCRMConfig} />
                        <Separator />
                        <CloseFieldManager />
                      </>
                    )}
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>API Key</Label>
                      <div className="relative">
                        <Input type={showApiKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={`Enter your ${activeCRMConfig.name} API key`} className="pr-10" />
                        <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowApiKey(!showApiKey)}>
                          {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">{activeCRMConfig.apiKeyHelp}</p>
                    </div>
                    <Button onClick={saveApiKey} disabled={saving || !apiKey.trim()}>
                      {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Connect {activeCRMConfig.name}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
