import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreditCard, ChevronDown, ChevronRight, Loader2, RefreshCw, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { useIntegrationConfig, PAYMENT_PROCESSOR_CONFIGS } from '@/hooks/useIntegrationConfig';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';

export function PaymentProcessorsSection() {
  const { integrations, updateIntegrations, hasWhop, orgId } = useIntegrationConfig();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isOpen, setIsOpen] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showStripeKey, setShowStripeKey] = useState(false);
  const [whopApiKey, setWhopApiKey] = useState('');
  const [whopCompanyId, setWhopCompanyId] = useState('');
  const [stripeSecretKey, setStripeSecretKey] = useState('');
  const [stripePublishableKey, setStripePublishableKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingStripe, setSavingStripe] = useState(false);
  const [syncingWhop, setSyncingWhop] = useState(false);
  const [selectedWhopConnection, setSelectedWhopConnection] = useState<string>('legacy');
  const [whopStartDate, setWhopStartDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [whopEndDate, setWhopEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  // Check if Stripe is connected (has encrypted key)
  const hasStripe = !!integrations?.stripe_api_key_encrypted || !!integrations?.stripe_publishable_key;

  const { data: whopConnections = [] } = useQuery({
    queryKey: ['whop-connections', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.from('webhook_connections').select('*').eq('connection_type', 'whop').eq('is_active', true).eq('organization_id', orgId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  const saveWhopKey = async () => {
    if (!whopApiKey.trim()) return;
    setSaving(true);
    try {
      await updateIntegrations.mutateAsync({ whop_api_key: whopApiKey.trim(), whop_company_id: whopCompanyId.trim() || null, primary_payment_processor: 'whop' });
      setWhopApiKey('');
      setWhopCompanyId('');
    } finally {
      setSaving(false);
    }
  };

  const saveStripeKey = async () => {
    if (!stripeSecretKey.trim()) return;
    if (!stripeSecretKey.startsWith('sk_')) {
      toast({ title: 'Invalid Key', description: 'Stripe secret key should start with sk_', variant: 'destructive' });
      return;
    }
    setSavingStripe(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Encrypt and save the secret key using manage-api-keys
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          action: 'save',
          organizationId: orgId,
          keyType: 'stripe',
          apiKey: stripeSecretKey.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to encrypt key');
      }

      // Also save the publishable key (not encrypted, it's public)
      if (stripePublishableKey.trim()) {
        await updateIntegrations.mutateAsync({ 
          stripe_publishable_key: stripePublishableKey.trim(),
          primary_payment_processor: 'stripe' 
        });
      }

      queryClient.invalidateQueries({ queryKey: ['org-integrations', orgId] });
      toast({ title: 'Stripe Connected', description: 'Your Stripe API key has been securely encrypted and saved.' });
      setStripeSecretKey('');
      setStripePublishableKey('');
    } catch (err) {
      toast({ title: 'Failed to save', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSavingStripe(false);
    }
  };

  const syncFromWhop = async () => {
    if (!orgId) return;
    setSyncingWhop(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const endpoint = selectedWhopConnection === 'legacy' 
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-whop` 
        : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-whop-connection`;
      const body = selectedWhopConnection === 'legacy' 
        ? { action: 'sync', organizationId: orgId } 
        : { 
            action: 'sync', 
            organizationId: orgId,  // Always include organizationId
            connectionId: selectedWhopConnection, 
            startDate: new Date(whopStartDate + 'T00:00:00').toISOString(), 
            endDate: new Date(whopEndDate + 'T23:59:59').toISOString() 
          };
      const response = await fetch(endpoint, { 
        method: 'POST', 
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${session?.access_token}`, 
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY 
        }, 
        body: JSON.stringify(body) 
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      // Handle both response formats: sync-whop uses 'synced', sync-whop-connection uses 'created', 'matched', 'updated'
      const syncedCount = data?.synced ?? (data?.created ?? 0) + (data?.updated ?? 0) + (data?.matched ?? 0);
      const details = data?.created !== undefined 
        ? `Created: ${data.created}, Updated: ${data.updated}, Matched: ${data.matched}` 
        : `${syncedCount} payments`;
      toast({ title: 'Whop Sync Complete', description: details });
    } catch (err) {
      toast({ title: 'Sync Failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSyncingWhop(false);
    }
  };

  const hasAnyWhop = hasWhop || whopConnections.length > 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <CreditCard className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <CardTitle className="text-lg">Payment Processors</CardTitle>
                  <CardDescription>Whop, Stripe, and payment tracking</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(hasAnyWhop || hasStripe) && (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                    {(hasWhop ? 1 : 0) + whopConnections.length + (hasStripe ? 1 : 0)} Connection{(hasWhop ? 1 : 0) + whopConnections.length + (hasStripe ? 1 : 0) !== 1 ? 's' : ''}
                  </Badge>
                )}
                {isOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-6 pt-0">
            {/* Whop Section */}
            <div className="p-4 rounded-lg border space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <h4 className="font-medium">{PAYMENT_PROCESSOR_CONFIGS.whop.name}</h4>
                    <p className="text-sm text-muted-foreground">Sync payment data</p>
                  </div>
                </div>
                {hasAnyWhop && <Badge variant="outline" className="bg-success/10 text-success border-success/20">Connected</Badge>}
              </div>

              {hasAnyWhop ? (
                <>
                  <div className="space-y-2">
                    <Label>Whop Account</Label>
                    <Select value={selectedWhopConnection} onValueChange={setSelectedWhopConnection}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>
                        {hasWhop && <SelectItem value="legacy">Legacy</SelectItem>}
                        {whopConnections.map((conn) => <SelectItem key={conn.id} value={conn.id}>{conn.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Date Range</Label>
                    <div className="flex gap-2">
                      <Input type="date" value={whopStartDate} onChange={(e) => setWhopStartDate(e.target.value)} />
                      <Input type="date" value={whopEndDate} onChange={(e) => setWhopEndDate(e.target.value)} />
                    </div>
                  </div>
                  <Button onClick={syncFromWhop} disabled={syncingWhop}>
                    {syncingWhop ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Sync Payments
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <div className="relative">
                      <Input type={showApiKey ? 'text' : 'password'} value={whopApiKey} onChange={(e) => setWhopApiKey(e.target.value)} placeholder="Enter Whop API key" className="pr-10" />
                      <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowApiKey(!showApiKey)}>
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Company ID (optional)</Label>
                    <Input value={whopCompanyId} onChange={(e) => setWhopCompanyId(e.target.value)} placeholder="Whop Company ID" />
                  </div>
                  <Button onClick={saveWhopKey} disabled={saving || !whopApiKey.trim()}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Connect Whop
                  </Button>
                </div>
              )}
            </div>

            {/* Stripe Section - Now Enabled! */}
            <div className="p-4 rounded-lg border space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <h4 className="font-medium">{PAYMENT_PROCESSOR_CONFIGS.stripe.name}</h4>
                    <p className="text-sm text-muted-foreground">Process payments securely</p>
                  </div>
                </div>
                {hasStripe && (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                )}
              </div>

              {hasStripe ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-success" />
                    <span>Stripe API key is securely encrypted</span>
                  </div>
                  {integrations?.stripe_publishable_key && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Publishable Key: </span>
                      <code className="bg-muted px-2 py-1 rounded text-xs">
                        {integrations.stripe_publishable_key.substring(0, 20)}...
                      </code>
                    </div>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      // Reset to allow updating keys
                      updateIntegrations.mutateAsync({ 
                        stripe_publishable_key: null 
                      }).then(() => {
                        // Clear encrypted key via edge function
                        supabase.auth.getSession().then(({ data: { session } }) => {
                          if (session) {
                            fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-api-keys`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${session.access_token}`,
                                'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                              },
                              body: JSON.stringify({
                                action: 'delete',
                                organizationId: orgId,
                                keyType: 'stripe',
                              }),
                            }).then(() => {
                              queryClient.invalidateQueries({ queryKey: ['org-integrations', orgId] });
                              toast({ title: 'Stripe disconnected' });
                            });
                          }
                        });
                      });
                    }}
                  >
                    Disconnect Stripe
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-500">Secure Storage</p>
                      <p className="text-muted-foreground">Your API key will be encrypted with AES-256-GCM before storage.</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Secret Key</Label>
                    <div className="relative">
                      <Input 
                        type={showStripeKey ? 'text' : 'password'} 
                        value={stripeSecretKey} 
                        onChange={(e) => setStripeSecretKey(e.target.value)} 
                        placeholder="sk_live_..." 
                        className="pr-10 font-mono text-sm" 
                      />
                      <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowStripeKey(!showStripeKey)}>
                        {showStripeKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Get your secret key from{' '}
                      <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        Stripe Dashboard → API Keys
                      </a>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Publishable Key (optional)</Label>
                    <Input 
                      value={stripePublishableKey} 
                      onChange={(e) => setStripePublishableKey(e.target.value)} 
                      placeholder="pk_live_..." 
                      className="font-mono text-sm"
                    />
                  </div>
                  <Button onClick={saveStripeKey} disabled={savingStripe || !stripeSecretKey.trim()}>
                    {savingStripe && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Connect Stripe
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}