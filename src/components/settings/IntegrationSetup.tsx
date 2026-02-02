import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, CalendarIcon, Link, CreditCard, Settings, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useQueryClient } from '@tanstack/react-query';

interface IntegrationSetupProps {
  existingIntegrations: {
    calendly_api_key?: string | null;
    calendly_webhook_signing_key?: string | null;
    close_api_key?: string | null;
    whop_api_key?: string | null;
    whop_company_id?: string | null;
    whop_webhook_signing_key?: string | null;
    ghl_api_key?: string | null;
    ghl_location_id?: string | null;
    stripe_webhook_signing_key?: string | null;
  } | null;
}

export function IntegrationSetup({ existingIntegrations }: IntegrationSetupProps) {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [saving, setSaving] = useState(false);
  
  // Toggle states
  const [enableCalendly, setEnableCalendly] = useState(false);
  const [enableClose, setEnableClose] = useState(false);
  const [enableWhop, setEnableWhop] = useState(false);
  const [enableGHL, setEnableGHL] = useState(false);
  
  // API key states
  const [calendlyApiKey, setCalendlyApiKey] = useState('');
  const [calendlyWebhookSigningKey, setCalendlyWebhookSigningKey] = useState('');
  const [closeApiKey, setCloseApiKey] = useState('');
  const [whopApiKey, setWhopApiKey] = useState('');
  const [whopCompanyId, setWhopCompanyId] = useState('');
  const [whopWebhookSigningKey, setWhopWebhookSigningKey] = useState('');
  const [ghlApiKey, setGhlApiKey] = useState('');
  const [ghlLocationId, setGhlLocationId] = useState('');
  const [stripeWebhookSigningKey, setStripeWebhookSigningKey] = useState('');
  
  // Show/hide password states
  const [showCalendlyKey, setShowCalendlyKey] = useState(false);
  const [showCalendlyWebhookKey, setShowCalendlyWebhookKey] = useState(false);
  const [showCloseKey, setShowCloseKey] = useState(false);
  const [showWhopKey, setShowWhopKey] = useState(false);
  const [showWhopWebhookKey, setShowWhopWebhookKey] = useState(false);
  const [showStripeWebhookKey, setShowStripeWebhookKey] = useState(false);
  const [showGhlKey, setShowGhlKey] = useState(false);

  // Initialize from existing integrations
  useEffect(() => {
    if (existingIntegrations) {
      const hasCalendly = !!existingIntegrations.calendly_api_key && existingIntegrations.calendly_api_key !== 'configured';
      const hasClose = !!existingIntegrations.close_api_key && existingIntegrations.close_api_key !== 'configured';
      const hasWhop = !!existingIntegrations.whop_api_key && existingIntegrations.whop_api_key !== 'configured';
      const hasGHL = !!existingIntegrations.ghl_api_key && existingIntegrations.ghl_api_key !== 'configured';
      
      setEnableCalendly(hasCalendly || existingIntegrations.calendly_api_key === 'configured');
      setEnableClose(hasClose || existingIntegrations.close_api_key === 'configured');
      setEnableWhop(hasWhop || existingIntegrations.whop_api_key === 'configured');
      setEnableGHL(hasGHL || existingIntegrations.ghl_api_key === 'configured');
      
      // Only set keys if they're actual keys (not 'configured' placeholder)
      if (hasCalendly) setCalendlyApiKey(existingIntegrations.calendly_api_key!);
      if (existingIntegrations.calendly_webhook_signing_key) setCalendlyWebhookSigningKey(existingIntegrations.calendly_webhook_signing_key);
      if (hasClose) setCloseApiKey(existingIntegrations.close_api_key!);
      if (hasWhop) setWhopApiKey(existingIntegrations.whop_api_key!);
      if (existingIntegrations.whop_company_id) setWhopCompanyId(existingIntegrations.whop_company_id);
      if (existingIntegrations.whop_webhook_signing_key) setWhopWebhookSigningKey(existingIntegrations.whop_webhook_signing_key);
      if (hasGHL) setGhlApiKey(existingIntegrations.ghl_api_key!);
      if (existingIntegrations.ghl_location_id) setGhlLocationId(existingIntegrations.ghl_location_id);
      if (existingIntegrations.stripe_webhook_signing_key) setStripeWebhookSigningKey(existingIntegrations.stripe_webhook_signing_key);
    } else {
      // Reset all states when no integrations exist
      setEnableCalendly(false);
      setEnableClose(false);
      setEnableWhop(false);
      setEnableGHL(false);
      setCalendlyApiKey('');
      setCalendlyWebhookSigningKey('');
      setCloseApiKey('');
      setWhopApiKey('');
      setWhopCompanyId('');
      setWhopWebhookSigningKey('');
      setGhlApiKey('');
      setGhlLocationId('');
      setStripeWebhookSigningKey('');
    }
  }, [existingIntegrations, currentOrganization?.id]);
  
  const handleSave = async () => {
    if (!currentOrganization?.id) {
      toast({
        title: 'Error',
        description: 'No organization selected',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      // If Calendly API key is provided, fetch the Calendly organization URI
      let calendlyOrgUri: string | null = null;
      if (enableCalendly && calendlyApiKey.trim()) {
        try {
          const response = await fetch('https://api.calendly.com/users/me', {
            headers: {
              'Authorization': `Bearer ${calendlyApiKey.trim()}`,
              'Content-Type': 'application/json',
            },
          });
          if (response.ok) {
            const data = await response.json();
            calendlyOrgUri = data.resource?.current_organization || null;
            console.log('Fetched Calendly organization URI:', calendlyOrgUri);
          } else {
            console.warn('Could not fetch Calendly organization URI:', response.status);
          }
        } catch (err) {
          console.warn('Error fetching Calendly org URI:', err);
        }
      }

      console.log('Saving integration data for org:', currentOrganization.id);
      console.log('Calendly key length:', calendlyApiKey.trim().length);
      
      const { data, error } = await supabase
        .from('organization_integrations')
        .upsert({
          organization_id: currentOrganization.id,
          calendly_api_key: enableCalendly ? (calendlyApiKey.trim() || null) : null,
          calendly_webhook_signing_key: enableCalendly ? (calendlyWebhookSigningKey.trim() || null) : null,
          close_api_key: enableClose ? (closeApiKey.trim() || null) : null,
          whop_api_key: enableWhop ? (whopApiKey.trim() || null) : null,
          whop_company_id: enableWhop ? (whopCompanyId.trim() || null) : null,
          whop_webhook_signing_key: enableWhop ? (whopWebhookSigningKey.trim() || null) : null,
          ghl_api_key: enableGHL ? (ghlApiKey.trim() || null) : null,
          ghl_location_id: enableGHL ? (ghlLocationId.trim() || null) : null,
          stripe_webhook_signing_key: stripeWebhookSigningKey.trim() || null,
        }, { onConflict: 'organization_id' })
        .select();
      
      if (error) {
        console.error('Save error:', error);
        throw error;
      }
      
      console.log('Save successful:', data);
      
      toast({
        title: 'Integrations Updated',
        description: 'Your organization integrations have been saved.',
      });
      
      queryClient.invalidateQueries({ queryKey: ['org-integrations'] });
    } catch (err) {
      console.error('Integration save error:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save integrations',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Configure Integrations</CardTitle>
            <CardDescription>
              Set up API keys for {currentOrganization?.name || 'this organization'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {/* Calendly */}
          <div className="p-4 rounded-lg border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <CalendarIcon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Calendly</p>
                  <p className="text-sm text-muted-foreground">Sync calendar events automatically</p>
                </div>
              </div>
              <Switch
                checked={enableCalendly}
                onCheckedChange={setEnableCalendly}
              />
            </div>
            {enableCalendly && (
              <div className="space-y-3 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="calendly-key">API Key</Label>
                  <div className="relative">
                    <Input
                      id="calendly-key"
                      type={showCalendlyKey ? 'text' : 'password'}
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
                      onClick={() => setShowCalendlyKey(!showCalendlyKey)}
                    >
                      {showCalendlyKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="calendly-webhook-key">Webhook Signing Key (optional)</Label>
                  <div className="relative">
                    <Input
                      id="calendly-webhook-key"
                      type={showCalendlyWebhookKey ? 'text' : 'password'}
                      value={calendlyWebhookSigningKey}
                      onChange={(e) => setCalendlyWebhookSigningKey(e.target.value)}
                      placeholder="Enter Calendly webhook signing key"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowCalendlyWebhookKey(!showCalendlyWebhookKey)}
                    >
                      {showCalendlyWebhookKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    For signature verification. Get from Calendly → Webhooks → Your webhook → Signing key
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get your API key from Calendly → Integrations → API & Webhooks
                </p>
              </div>
            )}
          </div>
          
          {/* Close CRM */}
          <div className="p-4 rounded-lg border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <Link className="h-4 w-4 text-success" />
                </div>
                <div>
                  <p className="font-medium">Close CRM</p>
                  <p className="text-sm text-muted-foreground">Sync leads and deals from Close</p>
                </div>
              </div>
              <Switch
                checked={enableClose}
                onCheckedChange={setEnableClose}
              />
            </div>
            {enableClose && (
              <div className="space-y-2 pt-2">
                <Label htmlFor="close-key">API Key</Label>
                <div className="relative">
                  <Input
                    id="close-key"
                    type={showCloseKey ? 'text' : 'password'}
                    value={closeApiKey}
                    onChange={(e) => setCloseApiKey(e.target.value)}
                    placeholder="Enter your Close API key"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowCloseKey(!showCloseKey)}
                  >
                    {showCloseKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get your API key from Close → Settings → API Keys
                </p>
              </div>
            )}
          </div>
          
          {/* Whop */}
          <div className="p-4 rounded-lg border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <CreditCard className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Whop</p>
                  <p className="text-sm text-muted-foreground">Sync payment data from Whop</p>
                </div>
              </div>
              <Switch
                checked={enableWhop}
                onCheckedChange={setEnableWhop}
              />
            </div>
            {enableWhop && (
              <div className="space-y-3 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="whop-key">API Key</Label>
                  <div className="relative">
                    <Input
                      id="whop-key"
                      type={showWhopKey ? 'text' : 'password'}
                      value={whopApiKey}
                      onChange={(e) => setWhopApiKey(e.target.value)}
                      placeholder="Enter your Whop API key"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowWhopKey(!showWhopKey)}
                    >
                      {showWhopKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whop-company">Company ID</Label>
                  <Input
                    id="whop-company"
                    value={whopCompanyId}
                    onChange={(e) => setWhopCompanyId(e.target.value)}
                    placeholder="Enter your Whop Company ID"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whop-webhook-key">Webhook Signing Key (optional)</Label>
                  <div className="relative">
                    <Input
                      id="whop-webhook-key"
                      type={showWhopWebhookKey ? 'text' : 'password'}
                      value={whopWebhookSigningKey}
                      onChange={(e) => setWhopWebhookSigningKey(e.target.value)}
                      placeholder="Enter Whop webhook signing key"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowWhopWebhookKey(!showWhopWebhookKey)}
                    >
                      {showWhopWebhookKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    For signature verification. Get from Whop → Developer Settings → Webhooks
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get your API key and Company ID from Whop → Developer Settings
                </p>
              </div>
            )}
          </div>

          {/* Go High Level */}
          <div className="p-4 rounded-lg border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <Link className="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <p className="font-medium">Go High Level</p>
                  <p className="text-sm text-muted-foreground">Sync leads and contacts from GHL</p>
                </div>
              </div>
              <Switch
                checked={enableGHL}
                onCheckedChange={setEnableGHL}
              />
            </div>
            {enableGHL && (
              <div className="space-y-3 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="ghl-key">API Key</Label>
                  <div className="relative">
                    <Input
                      id="ghl-key"
                      type={showGhlKey ? 'text' : 'password'}
                      value={ghlApiKey}
                      onChange={(e) => setGhlApiKey(e.target.value)}
                      placeholder="Enter your Go High Level API key"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowGhlKey(!showGhlKey)}
                    >
                      {showGhlKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get your API key from GHL → Settings → Business Profile → API Keys
                </p>
              </div>
            )}
          </div>

          {/* Stripe Webhook Security */}
          <div className="p-4 rounded-lg border space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <CreditCard className="h-4 w-4 text-purple-500" />
              </div>
              <div>
                <p className="font-medium">Stripe Webhook Security</p>
                <p className="text-sm text-muted-foreground">Verify Stripe webhook signatures</p>
              </div>
            </div>
            <div className="space-y-2 pt-2">
              <Label htmlFor="stripe-webhook-key">Webhook Signing Secret (whsec_...)</Label>
              <div className="relative">
                <Input
                  id="stripe-webhook-key"
                  type={showStripeWebhookKey ? 'text' : 'password'}
                  value={stripeWebhookSigningKey}
                  onChange={(e) => setStripeWebhookSigningKey(e.target.value)}
                  placeholder="whsec_..."
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowStripeWebhookKey(!showStripeWebhookKey)}
                >
                  {showStripeWebhookKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Get from Stripe Dashboard → Developers → Webhooks → Your endpoint → Signing secret
              </p>
            </div>
          </div>
        </div>
        
        <div className="pt-2">
          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Save Integration Settings
          </Button>
        </div>
        
        <p className="text-xs text-muted-foreground">
          Each organization has its own API keys. Enter the credentials for {currentOrganization?.name || 'this organization'}.
        </p>
      </CardContent>
    </Card>
  );
}
