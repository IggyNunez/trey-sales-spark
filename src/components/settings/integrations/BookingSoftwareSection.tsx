import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar, ChevronDown, ChevronRight, Loader2, Download, Trash2, Eye, EyeOff, Users } from 'lucide-react';
import { useIntegrationConfig, BOOKING_PLATFORM_CONFIGS } from '@/hooks/useIntegrationConfig';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { format, subDays, addDays } from 'date-fns';
import { CalendlyWebhookStatus } from '../CalendlyWebhookStatus';
import { CalcomWebhookStatus } from '../CalcomWebhookStatus';
import { CalcomEventTypeManager } from '../CalcomEventTypeManager';

export function BookingSoftwareSection() {
  const { integrations, updateIntegrations, hasCalendly, hasCalcom, orgId } = useIntegrationConfig();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isOpen, setIsOpen] = useState(true);
  
  // Calendly state
  const [showCalendlyApiKey, setShowCalendlyApiKey] = useState(false);
  const [calendlyApiKey, setCalendlyApiKey] = useState('');
  const [savingCalendly, setSavingCalendly] = useState(false);
  const [syncingCalendly, setSyncingCalendly] = useState(false);
  const [cleaningEvents, setCleaningEvents] = useState(false);
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);
  const [calendlyFilter, setCalendlyFilter] = useState('');
  const [calendlyStartDate, setCalendlyStartDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [calendlyEndDate, setCalendlyEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  // Cal.com state
  const [showCalcomApiKey, setShowCalcomApiKey] = useState(false);
  const [calcomApiKey, setCalcomApiKey] = useState('');
  const [savingCalcom, setSavingCalcom] = useState(false);
  const [syncingCalcom, setSyncingCalcom] = useState(false);
  const [backfillingCalcomClosers, setBackfillingCalcomClosers] = useState(false);
  const [backfillingCalcomNoshows, setBackfillingCalcomNoshows] = useState(false);
  const [resyncingUTM, setResyncingUTM] = useState(false);
  const [calcomSyncFilter, setCalcomSyncFilter] = useState('');
  const [calcomSyncStartDate, setCalcomSyncStartDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  // Default to a future end-date so upcoming bookings import without extra config
  const [calcomSyncEndDate, setCalcomSyncEndDate] = useState<string>(format(addDays(new Date(), 120), 'yyyy-MM-dd'));
  // Default to ALL so teams see both historical + upcoming bookings (including far-future calendars)
  const [calcomSyncStatus, setCalcomSyncStatus] = useState<'all' | 'past' | 'upcoming' | 'cancelled'>('all');

  const primaryPlatform = integrations?.primary_booking_platform || 'none';

  // ============ CALENDLY HANDLERS ============
  const saveCalendlyKey = async () => {
    if (!calendlyApiKey.trim() || !orgId) {
      toast({ title: 'Enter an API key', variant: 'destructive' });
      return;
    }
    setSavingCalendly(true);
    try {
      const { data: saveData, error: saveError } = await supabase.functions.invoke('manage-api-keys', {
        body: {
          action: 'save',
          organizationId: orgId,
          keyType: 'calendly',
          apiKey: calendlyApiKey.trim(),
        },
      });

      if (saveError || !saveData?.success) {
        throw new Error(saveError?.message || saveData?.error || 'Failed to save API key');
      }

      await updateIntegrations.mutateAsync({
        primary_booking_platform: 'calendly',
      });

      toast({ title: 'API key saved! Registering webhook...' });

      const { data: webhookData, error: webhookError } = await supabase.functions.invoke('register-calendly-webhook', {
        body: { action: 'register', organizationId: orgId },
      });

      if (webhookError || webhookData?.error) {
        toast({
          title: 'API key saved, but webhook registration failed',
          description: webhookError?.message || webhookData?.error,
          variant: 'destructive'
        });
      } else {
        toast({ title: 'Calendly connected successfully!' });
      }

      setCalendlyApiKey('');
      queryClient.invalidateQueries({ queryKey: ['org-integrations'] });
    } catch (err) {
      toast({
        title: 'Failed to save API key',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive'
      });
    } finally {
      setSavingCalendly(false);
    }
  };

  const disconnectCalendly = async () => {
    if (!orgId) return;
    try {
      const { error } = await supabase
        .from('organization_integrations')
        .update({ 
          calendly_api_key: null, 
          calendly_api_key_encrypted: null,
          calendly_webhook_signing_key: null,
          primary_booking_platform: hasCalcom ? 'calcom' : 'none',
        })
        .eq('organization_id', orgId);
      if (error) throw error;
      toast({ title: 'Calendly disconnected' });
      queryClient.invalidateQueries({ queryKey: ['org-integrations'] });
    } catch (err) {
      toast({ title: 'Failed to disconnect', variant: 'destructive' });
    }
  };

  const syncFromCalendly = async () => {
    if (!orgId) return;
    setSyncingCalendly(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-calendly', {
        body: { 
          filterName: calendlyFilter,
          startDate: new Date(calendlyStartDate + 'T00:00:00').toISOString(),
          endDate: new Date(calendlyEndDate + 'T23:59:59').toISOString(),
          organizationId: orgId,
        }
      });
      
      if (error) throw error;
      toast({
        title: 'Calendly Sync Complete',
        description: `Found ${data?.totalFound || 0} events. Created: ${data?.created || 0}, Updated: ${data?.updated || 0}`,
      });
    } catch (err) {
      toast({
        title: 'Sync Failed',
        description: err instanceof Error ? err.message : 'Could not sync with Calendly',
        variant: 'destructive',
      });
    } finally {
      setSyncingCalendly(false);
    }
  };

  const cleanupNonMatchingEvents = async () => {
    if (!orgId || !calendlyFilter.trim()) return;
    setCleaningEvents(true);
    try {
      let query = supabase
        .from('events')
        .select('id, event_name, scheduled_at')
        .eq('organization_id', orgId)
        .eq('booking_platform', 'calendly');
      
      if (calendlyStartDate) query = query.gte('scheduled_at', `${calendlyStartDate}T00:00:00Z`);
      if (calendlyEndDate) query = query.lte('scheduled_at', `${calendlyEndDate}T23:59:59Z`);
      
      const { data: eventsToCheck, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      
      const filterLower = calendlyFilter.toLowerCase().replace(/[-_\s]/g, '');
      const nonMatchingEvents = (eventsToCheck || []).filter(e => {
        if (!e.event_name) return true;
        const eventNameNormalized = e.event_name.toLowerCase().replace(/[-_\s]/g, '');
        return !eventNameNormalized.includes(filterLower);
      });
      
      if (nonMatchingEvents.length === 0) {
        toast({ title: 'No Events to Clean', description: 'All events match your filter' });
        return;
      }
      
      if (!window.confirm(`Delete ${nonMatchingEvents.length} Calendly events that don't match "${calendlyFilter}"?`)) return;
      
      const { data, error: deleteError } = await supabase.functions.invoke('delete-events', {
        body: { eventIds: nonMatchingEvents.map(e => e.id), organizationId: orgId },
      });
      
      if (deleteError) throw deleteError;
      toast({ title: 'Cleanup Complete', description: `Deleted ${data?.deleted || nonMatchingEvents.length} events` });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    } catch (err) {
      toast({ title: 'Cleanup Failed', variant: 'destructive' });
    } finally {
      setCleaningEvents(false);
    }
  };

  const cleanupDuplicates = async () => {
    if (!orgId) return;
    setCleaningDuplicates(true);
    try {
      const { data: allEvents, error: fetchError } = await supabase
        .from('events')
        .select('id, lead_email, scheduled_at, event_name, created_at')
        .eq('organization_id', orgId)
        .not('lead_email', 'is', null)
        .not('scheduled_at', 'is', null)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;

      const grouped = new Map<string, typeof allEvents>();
      for (const event of allEvents || []) {
        const scheduledDate = new Date(event.scheduled_at);
        scheduledDate.setSeconds(0, 0);
        const key = `${event.lead_email}|${scheduledDate.toISOString()}|${event.event_name || ''}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(event);
      }

      const duplicates = Array.from(grouped.values()).filter(group => group.length > 1);
      if (duplicates.length === 0) {
        toast({ title: 'No Duplicates Found' });
        return;
      }

      let totalDeleted = 0;
      for (const group of duplicates) {
        const toDelete = group.slice(1);
        const { error: deleteError } = await supabase.from('events').delete().in('id', toDelete.map(e => e.id));
        if (deleteError) throw deleteError;
        totalDeleted += toDelete.length;
      }

      toast({ title: 'Duplicates Cleaned', description: `Deleted ${totalDeleted} duplicate events` });
    } catch (err) {
      toast({ title: 'Cleanup Failed', variant: 'destructive' });
    } finally {
      setCleaningDuplicates(false);
    }
  };

  // ============ CAL.COM HANDLERS ============
  const saveCalcomKey = async () => {
    if (!calcomApiKey.trim() || !orgId) {
      toast({ title: 'Enter an API key', variant: 'destructive' });
      return;
    }
    setSavingCalcom(true);
    try {
      const { data: saveData, error: saveError } = await supabase.functions.invoke('manage-api-keys', {
        body: {
          action: 'save',
          organizationId: orgId,
          keyType: 'calcom',
          apiKey: calcomApiKey.trim(),
        },
      });

      if (saveError || !saveData?.success) {
        throw new Error(saveError?.message || saveData?.error || 'Failed to save API key');
      }

      // Set as primary if no other booking platform
      if (!hasCalendly) {
        await updateIntegrations.mutateAsync({
          primary_booking_platform: 'calcom',
        });
      }

      toast({ title: 'API key saved! Registering webhook...' });

      const { data: webhookData, error: webhookError } = await supabase.functions.invoke('register-calcom-webhook', {
        body: { organizationId: orgId },
      });

      if (webhookError || webhookData?.error) {
        toast({
          title: 'API key saved, but webhook registration failed',
          description: webhookError?.message || webhookData?.error,
          variant: 'destructive'
        });
      } else {
        toast({ title: 'Cal.com connected successfully!' });
      }

      setCalcomApiKey('');
      queryClient.invalidateQueries({ queryKey: ['org-integrations'] });
    } catch (err) {
      toast({
        title: 'Failed to save API key',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive'
      });
    } finally {
      setSavingCalcom(false);
    }
  };

  const disconnectCalcom = async () => {
    if (!orgId) return;
    try {
      const { error } = await supabase
        .from('organization_integrations')
        .update({ 
          calcom_api_key_encrypted: null,
          calcom_webhook_secret: null,
          calcom_webhook_id: null,
          calcom_webhook_registered_at: null,
          primary_booking_platform: hasCalendly ? 'calendly' : 'none',
        })
        .eq('organization_id', orgId);
      if (error) throw error;
      toast({ title: 'Cal.com disconnected' });
      queryClient.invalidateQueries({ queryKey: ['org-integrations'] });
    } catch (err) {
      toast({ title: 'Failed to disconnect', variant: 'destructive' });
    }
  };

  const syncFromCalcom = async () => {
    if (!orgId) return;
    setSyncingCalcom(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-calcom', {
        body: { 
          organizationId: orgId,
          filterName: calcomSyncFilter || undefined,
          startDate: calcomSyncStartDate,
          endDate: calcomSyncEndDate,
          status: calcomSyncStatus,
        }
      });
      
      if (error) throw error;
      toast({
        title: 'Cal.com Sync Complete',
        description: `Found ${data?.totalBookings || 0} bookings. Created: ${data?.created || 0}, Skipped: ${data?.skipped || 0}`,
      });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    } catch (err) {
      toast({
        title: 'Sync Failed',
        description: err instanceof Error ? err.message : 'Could not sync with Cal.com',
        variant: 'destructive',
      });
    } finally {
      setSyncingCalcom(false);
    }
  };

  const backfillCalcomClosers = async () => {
    if (!orgId) return;
    setBackfillingCalcomClosers(true);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-calcom-closers', {
        body: { organizationId: orgId }
      });
      
      if (error) throw error;
      toast({
        title: 'Backfill Complete',
        description: `Updated ${data?.updated || 0} events with closer info`,
      });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    } catch (err) {
      toast({
        title: 'Backfill Failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setBackfillingCalcomClosers(false);
    }
  };

  const backfillCalcomNoshows = async () => {
    if (!orgId) return;
    setBackfillingCalcomNoshows(true);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-calcom-noshows', {
        body: { organizationId: orgId }
      });
      
      if (error) throw error;
      toast({
        title: 'No-Show Backfill Complete',
        description: `Updated ${data?.updated || 0} events`,
      });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    } catch (err) {
      toast({
        title: 'Backfill Failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setBackfillingCalcomNoshows(false);
    }
  };

  const resyncCalcomUTM = async () => {
    if (!orgId) return;
    setResyncingUTM(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-calcom', {
        body: { 
          organizationId: orgId,
          startDate: calcomSyncStartDate,
          endDate: calcomSyncEndDate,
          status: calcomSyncStatus,
          forceUpdate: true, // This triggers update of existing records with UTM data
        }
      });
      
      if (error) throw error;
      toast({
        title: 'UTM Data Re-sync Complete',
        description: `Updated ${data?.created || 0} events. Skipped: ${data?.skipped || 0}`,
      });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['utm-platform-values'] });
    } catch (err) {
      toast({
        title: 'Re-sync Failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setResyncingUTM(false);
    }
  };

  const handlePrimaryPlatformChange = async (value: string) => {
    try {
      await updateIntegrations.mutateAsync({
        primary_booking_platform: value as 'calendly' | 'calcom' | 'none',
      });
      toast({ title: `Primary platform set to ${value === 'none' ? 'None' : value === 'calcom' ? 'Cal.com' : 'Calendly'}` });
    } catch (err) {
      toast({ title: 'Failed to update', variant: 'destructive' });
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Booking Software</CardTitle>
                  <CardDescription>Calendly, Cal.com, and other scheduling tools</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasCalendly && (
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                    Calendly
                  </Badge>
                )}
                {hasCalcom && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    Cal.com
                  </Badge>
                )}
                {isOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-6 pt-0">
            {/* Calendly */}
            <div className="p-4 rounded-lg border space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <h4 className="font-medium">{BOOKING_PLATFORM_CONFIGS.calendly.name}</h4>
                    <p className="text-sm text-muted-foreground">Automatic event sync via webhook</p>
                  </div>
                </div>
                {hasCalendly && (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                    Connected
                  </Badge>
                )}
              </div>

              {hasCalendly ? (
                <>
                  <CalendlyWebhookStatus onDisconnect={disconnectCalendly} />
                  
                  <Separator />
                  
                  <details className="group">
                    <summary className="flex items-center justify-between cursor-pointer list-none">
                      <h4 className="font-medium text-sm">Manual Sync & Cleanup</h4>
                      <span className="text-xs text-muted-foreground group-open:hidden">Click to expand</span>
                    </summary>
                    
                    <div className="mt-4 space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Event Name Filter</Label>
                          <Input 
                            value={calendlyFilter}
                            onChange={(e) => setCalendlyFilter(e.target.value)}
                            placeholder="e.g., acquisition ace"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Date Range</Label>
                          <div className="flex gap-2">
                            <Input type="date" value={calendlyStartDate} onChange={(e) => setCalendlyStartDate(e.target.value)} />
                            <Input type="date" value={calendlyEndDate} onChange={(e) => setCalendlyEndDate(e.target.value)} />
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={syncFromCalendly} disabled={syncingCalendly} size="sm">
                          {syncingCalendly ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                          Sync Events
                        </Button>
                        <Button onClick={cleanupNonMatchingEvents} disabled={cleaningEvents || !calendlyFilter.trim()} variant="outline" size="sm">
                          {cleaningEvents ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                          Delete Non-Matching
                        </Button>
                        <Button onClick={cleanupDuplicates} disabled={cleaningDuplicates} variant="outline" size="sm">
                          {cleaningDuplicates ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                          Delete Duplicates
                        </Button>
                      </div>
                    </div>
                  </details>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <div className="relative">
                      <Input
                        type={showCalendlyApiKey ? 'text' : 'password'}
                        value={calendlyApiKey}
                        onChange={(e) => setCalendlyApiKey(e.target.value)}
                        placeholder="Enter your Calendly API key"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowCalendlyApiKey(!showCalendlyApiKey)}
                      >
                        {showCalendlyApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Get your API key from Calendly → Integrations → API & Webhooks
                    </p>
                  </div>
                  <Button onClick={saveCalendlyKey} disabled={savingCalendly || !calendlyApiKey.trim()}>
                    {savingCalendly && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Connect Calendly
                  </Button>
                </div>
              )}
            </div>

            {/* Cal.com */}
            <div className="p-4 rounded-lg border space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <h4 className="font-medium">{BOOKING_PLATFORM_CONFIGS.calcom.name}</h4>
                    <p className="text-sm text-muted-foreground">Open source scheduling with rich metadata</p>
                  </div>
                </div>
                {hasCalcom && (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                    Connected
                  </Badge>
                )}
              </div>

              {hasCalcom ? (
                <>
                  <CalcomWebhookStatus onDisconnect={disconnectCalcom} />
                  
                  <Separator />
                  
                  <details className="group">
                    <summary className="flex items-center justify-between cursor-pointer list-none">
                      <h4 className="font-medium text-sm">Manual Sync & Cleanup</h4>
                      <span className="text-xs text-muted-foreground group-open:hidden">Click to expand</span>
                    </summary>
                    
                    <div className="mt-4 space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Event Type Filter</Label>
                          <Input 
                            value={calcomSyncFilter}
                            onChange={(e) => setCalcomSyncFilter(e.target.value)}
                            placeholder="e.g., discovery call"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Date Range</Label>
                          <div className="flex gap-2">
                            <Input type="date" value={calcomSyncStartDate} onChange={(e) => setCalcomSyncStartDate(e.target.value)} />
                            <Input type="date" value={calcomSyncEndDate} onChange={(e) => setCalcomSyncEndDate(e.target.value)} />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Status</Label>
                        <RadioGroup value={calcomSyncStatus} onValueChange={(v) => setCalcomSyncStatus(v as typeof calcomSyncStatus)} className="flex flex-wrap gap-4">
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="all" id="calcom-all" />
                            <Label htmlFor="calcom-all" className="font-normal">All</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="past" id="calcom-past" />
                            <Label htmlFor="calcom-past" className="font-normal">Past</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="upcoming" id="calcom-upcoming" />
                            <Label htmlFor="calcom-upcoming" className="font-normal">Upcoming</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="cancelled" id="calcom-cancelled" />
                            <Label htmlFor="calcom-cancelled" className="font-normal">Cancelled</Label>
                          </div>
                        </RadioGroup>
                        <p className="text-xs text-muted-foreground">
                          To import future bookings, set Status to <span className="font-medium">Upcoming</span> or <span className="font-medium">All</span> and choose an End Date in the future.
                        </p>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={syncFromCalcom} disabled={syncingCalcom} size="sm">
                          {syncingCalcom ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                          Sync from Cal.com
                        </Button>
                        <Button onClick={resyncCalcomUTM} disabled={resyncingUTM} variant="outline" size="sm">
                          {resyncingUTM ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                          Re-sync UTM Data
                        </Button>
                        <Button onClick={backfillCalcomClosers} disabled={backfillingCalcomClosers} variant="outline" size="sm">
                          {backfillingCalcomClosers ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Users className="h-4 w-4 mr-2" />}
                          Backfill Closers
                        </Button>
                        <Button onClick={backfillCalcomNoshows} disabled={backfillingCalcomNoshows} variant="outline" size="sm">
                          {backfillingCalcomNoshows ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                          Backfill No-Shows
                        </Button>
                      </div>
                    </div>
                  </details>
                  
                  <Separator />
                  
                  <details className="group" open>
                    <summary className="flex items-center justify-between cursor-pointer list-none">
                      <h4 className="font-medium text-sm">Automatic Sync Settings</h4>
                      <span className="text-xs text-muted-foreground group-open:hidden">Click to expand</span>
                    </summary>
                    
                    <div className="mt-4">
                      <CalcomEventTypeManager />
                    </div>
                  </details>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <div className="relative">
                      <Input
                        type={showCalcomApiKey ? 'text' : 'password'}
                        value={calcomApiKey}
                        onChange={(e) => setCalcomApiKey(e.target.value)}
                        placeholder="Enter your Cal.com API key"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowCalcomApiKey(!showCalcomApiKey)}
                      >
                        {showCalcomApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {BOOKING_PLATFORM_CONFIGS.calcom.apiKeyHelp}
                    </p>
                  </div>
                  <Button onClick={saveCalcomKey} disabled={savingCalcom || !calcomApiKey.trim()}>
                    {savingCalcom && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Connect Cal.com
                  </Button>
                </div>
              )}
            </div>

            {/* Acuity - Coming Soon */}
            <div className="p-4 rounded-lg border bg-muted/30 opacity-60">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <h4 className="font-medium">{BOOKING_PLATFORM_CONFIGS.acuity.name}</h4>
                  <p className="text-sm text-muted-foreground">Coming soon</p>
                </div>
              </div>
            </div>

            {/* Primary Platform Selector */}
            {(hasCalendly || hasCalcom) && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-sm">Primary Platform</h4>
                    <p className="text-xs text-muted-foreground">
                      Determines which platform's utilization data is shown on the dashboard
                    </p>
                  </div>
                  <RadioGroup value={primaryPlatform} onValueChange={handlePrimaryPlatformChange} className="flex flex-wrap gap-4">
                    {hasCalendly && (
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="calendly" id="primary-calendly" />
                        <Label htmlFor="primary-calendly" className="font-normal">Calendly</Label>
                      </div>
                    )}
                    {hasCalcom && (
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="calcom" id="primary-calcom" />
                        <Label htmlFor="primary-calcom" className="font-normal">Cal.com</Label>
                      </div>
                    )}
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="none" id="primary-none" />
                      <Label htmlFor="primary-none" className="font-normal">None</Label>
                    </div>
                  </RadioGroup>
                  <p className="text-xs text-muted-foreground">
                    ℹ️ Both platforms can be connected. All incoming webhooks are processed regardless of this setting.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
