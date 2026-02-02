import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { Link2, Copy, Check, Trash2, Calendar, Users, Eye, DollarSign, Mail, Send, FileText, TrendingUp, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { AppLayout } from '@/components/layout/AppLayout';
import { cn } from '@/lib/utils';
import FileComparisonUploader from '@/components/commissions/FileComparisonUploader';

interface Rep {
  id: string;
  name: string;
  type: 'closer' | 'setter';
  profile_id: string | null;
}

interface Profile {
  id: string;
  email: string;
}

interface CommissionLink {
  id: string;
  token: string;
  closer_name: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

interface SnapshotDetail {
  id: string;
  payment_date: string | null;
  customer_email: string | null;
  customer_name: string | null;
  amount: number;
  refund_amount: number;
  net_amount: number;
  closer_name: string | null;
  setter_name: string | null;
  source_name: string | null;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

export default function CommissionLinksPage() {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  const [selectedCloser, setSelectedCloser] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(startOfMonth(subMonths(new Date(), 1)));
  const [dateTo, setDateTo] = useState<Date | undefined>(endOfMonth(subMonths(new Date(), 1)));
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendEmail, setSendEmail] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [closerCommission, setCloserCommission] = useState<string>('10');
  const [setterCommission, setSetterCommission] = useState<string>('5');

  // Fetch all reps (closers + setters)
  const { data: allReps, refetch: refetchReps } = useQuery({
    queryKey: ['reps-for-links', orgId],
    queryFn: async () => {
      // Fetch closers
      const { data: closersData, error: closersError } = await supabase
        .from('closers')
        .select('id, name, profile_id')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('name');
      if (closersError) throw closersError;

      // Fetch setters
      const { data: settersData, error: settersError } = await supabase
        .from('setters')
        .select('id, name')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('name');
      if (settersError) throw settersError;

      // Combine and dedupe by name
      const reps: Rep[] = [];
      const namesSeen = new Set<string>();

      closersData?.forEach(c => {
        if (!namesSeen.has(c.name.toLowerCase())) {
          namesSeen.add(c.name.toLowerCase());
          reps.push({ id: c.id, name: c.name, type: 'closer', profile_id: c.profile_id });
        }
      });

      settersData?.forEach(s => {
        if (!namesSeen.has(s.name.toLowerCase())) {
          namesSeen.add(s.name.toLowerCase());
          reps.push({ id: s.id, name: s.name, type: 'setter', profile_id: null });
        }
      });

      return reps.sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: !!orgId,
  });

  // Fetch profiles to get emails
  const { data: profiles } = useQuery({
    queryKey: ['profiles-for-reps', allReps],
    queryFn: async () => {
      const profileIds = allReps?.filter(r => r.profile_id).map(r => r.profile_id) || [];
      if (profileIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', profileIds);
      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!allReps && allReps.length > 0,
  });

  // Fetch existing commission links
  const { data: existingLinks } = useQuery({
    queryKey: ['commission-links', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('closer_access_tokens')
        .select('*')
        .eq('organization_id', orgId)
        .neq('closer_name', '__UNIVERSAL__')
        .order('closer_name');
      if (error) throw error;
      return data as CommissionLink[];
    },
    enabled: !!orgId,
  });

  // Fetch payout snapshot details for selected rep preview
  const { data: snapshotDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['rep-snapshot-preview', orgId, selectedCloser],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payout_snapshot_details')
        .select('*')
        .eq('organization_id', orgId!)
        .or(`closer_name.ilike.%${selectedCloser}%,setter_name.ilike.%${selectedCloser}%`)
        .order('payment_date', { ascending: false });
      
      if (error) throw error;
      return data as SnapshotDetail[];
    },
    enabled: !!orgId && !!selectedCloser,
  });

  // Filter by date range and calculate stats
  const repStats = useMemo(() => {
    if (!snapshotDetails || !selectedCloser) return null;

    const filtered = snapshotDetails.filter(d => {
      if (!d.payment_date || !dateFrom || !dateTo) return true;
      const paymentDate = new Date(d.payment_date);
      return paymentDate >= dateFrom && paymentDate <= dateTo;
    });

    const closerDeals = filtered.filter(d => 
      d.closer_name?.toLowerCase() === selectedCloser.toLowerCase()
    );
    const setterDeals = filtered.filter(d => 
      d.setter_name?.toLowerCase() === selectedCloser.toLowerCase()
    );

    const closerAmount = closerDeals.reduce((sum, d) => sum + d.amount, 0);
    const closerRefunds = closerDeals.reduce((sum, d) => sum + d.refund_amount, 0);
    const setterAmount = setterDeals.reduce((sum, d) => sum + d.amount, 0);
    const setterRefunds = setterDeals.reduce((sum, d) => sum + d.refund_amount, 0);
    
    const closerNet = closerAmount - closerRefunds;
    const setterNet = setterAmount - setterRefunds;
    
    const closerPct = parseFloat(closerCommission) || 0;
    const setterPct = parseFloat(setterCommission) || 0;
    
    const closerPayout = closerNet * (closerPct / 100);
    const setterPayout = setterNet * (setterPct / 100);

    // Get all unique deals
    const allDealIds = new Set([...closerDeals.map(d => d.id), ...setterDeals.map(d => d.id)]);
    const allDeals = filtered.filter(d => allDealIds.has(d.id));

    return {
      closerDeals,
      setterDeals,
      allDeals,
      closerAmount,
      closerRefunds,
      closerNet,
      closerPayout,
      setterAmount,
      setterRefunds,
      setterNet,
      setterPayout,
      totalPayout: closerPayout + setterPayout,
    };
  }, [snapshotDetails, selectedCloser, dateFrom, dateTo, closerCommission, setterCommission]);

  // Get email for selected rep
  const selectedRepData = useMemo(() => {
    const rep = allReps?.find(r => r.name === selectedCloser);
    if (!rep) return null;
    const profile = profiles?.find(p => p.id === rep.profile_id);
    return { ...rep, email: profile?.email || '' };
  }, [allReps, profiles, selectedCloser]);

  // Auto-fill email when rep is selected
  const handleRepChange = (name: string) => {
    setSelectedCloser(name);
    const rep = allReps?.find(r => r.name === name);
    if (rep?.profile_id) {
      const profile = profiles?.find(p => p.id === rep.profile_id);
      setEmailAddress(profile?.email || '');
    } else {
      setEmailAddress('');
    }
  };

  // State for managing reps
  const [newRepName, setNewRepName] = useState('');
  const [newRepType, setNewRepType] = useState<'closer' | 'setter'>('closer');

  // Add new rep mutation
  const addRep = useMutation({
    mutationFn: async ({ name, type }: { name: string; type: 'closer' | 'setter' }) => {
      const table = type === 'closer' ? 'closers' : 'setters';
      const { error } = await supabase
        .from(table)
        .insert({ name, organization_id: orgId, is_active: true });
      if (error) throw error;
    },
    onSuccess: () => {
      refetchReps();
      setNewRepName('');
      toast({ title: 'Rep added successfully!' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to add rep', description: error.message, variant: 'destructive' });
    },
  });

  // Remove rep mutation (deactivates)
  const removeRep = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: 'closer' | 'setter' }) => {
      const table = type === 'closer' ? 'closers' : 'setters';
      const { error } = await supabase
        .from(table)
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchReps();
      toast({ title: 'Rep removed' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to remove rep', description: error.message, variant: 'destructive' });
    },
  });

  // Create link mutation
  const createLink = useMutation({
    mutationFn: async ({ closerName, email }: { closerName: string; email?: string }) => {
      const { data, error } = await supabase
        .from('closer_access_tokens')
        .insert({
          closer_name: closerName,
          organization_id: orgId,
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      
      if (email && sendEmail) {
        const link = getFullLink(data.token);
        const { error: emailError } = await supabase.functions.invoke('send-commission-link', {
          body: {
            email,
            repName: closerName,
            commissionLink: link,
            organizationName: currentOrganization?.name,
          },
        });
        if (emailError) {
          console.error('Failed to send email:', emailError);
          toast({ title: 'Link created but email failed to send', variant: 'destructive' });
        } else {
          toast({ title: 'Commission link created and emailed!' });
        }
      } else {
        toast({ title: 'Commission link created!' });
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-links'] });
      setSelectedCloser('');
      setEmailAddress('');
      setSendEmail(false);
    },
    onError: (error: any) => {
      console.error('Failed to create link:', error);
      toast({ title: 'Failed to create link', description: error.message, variant: 'destructive' });
    },
  });

  // Send email for existing link
  const sendEmailForLink = useMutation({
    mutationFn: async ({ link, email }: { link: CommissionLink; email: string }) => {
      setSendingEmailId(link.id);
      const fullLink = getFullLink(link.token);
      const { error } = await supabase.functions.invoke('send-commission-link', {
        body: {
          email,
          repName: link.closer_name,
          commissionLink: fullLink,
          organizationName: currentOrganization?.name,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Email sent successfully!' });
      setSendingEmailId(null);
    },
    onError: (error: any) => {
      toast({ title: 'Failed to send email', description: error.message, variant: 'destructive' });
      setSendingEmailId(null);
    },
  });

  // Delete link mutation
  const deleteLink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('closer_access_tokens')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-links'] });
      toast({ title: 'Link deleted' });
    },
  });

  const getFullLink = (token: string) => {
    const baseUrl = window.location.origin;
    let url = `${baseUrl}/my-commissions?token=${token}`;
    if (dateFrom) url += `&from=${format(dateFrom, 'yyyy-MM-dd')}`;
    if (dateTo) url += `&to=${format(dateTo, 'yyyy-MM-dd')}`;
    if (closerCommission) url += `&closerPct=${closerCommission}`;
    if (setterCommission) url += `&setterPct=${setterCommission}`;
    return url;
  };

  const copyToClipboard = async (token: string, id: string) => {
    const link = getFullLink(token);
    await navigator.clipboard.writeText(link);
    setCopiedId(id);
    toast({ title: 'Link copied to clipboard!' });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateLink = () => {
    if (!selectedCloser) return;
    createLink.mutate({ closerName: selectedCloser, email: sendEmail ? emailAddress : undefined });
  };

  // Get email for a rep
  const getEmailForRep = (repName: string) => {
    const rep = allReps?.find(r => r.name === repName);
    if (!rep?.profile_id) return null;
    return profiles?.find(p => p.id === rep.profile_id)?.email || null;
  };

  // Check which reps already have links
  const repsWithLinks = useMemo(() => {
    return new Set(existingLinks?.map(l => l.closer_name) || []);
  }, [existingLinks]);

  const availableReps = useMemo(() => {
    return allReps?.filter(r => !repsWithLinks.has(r.name)) || [];
  }, [allReps, repsWithLinks]);

  return (
    <AppLayout>
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-6xl">
        {/* Header */}
        <header className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <Link2 className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Commission Links</h1>
              <p className="text-sm text-muted-foreground hidden sm:block">
                Generate secure links for reps to view their commissions
              </p>
            </div>
          </div>
        </header>

        {/* File Comparison Upload */}
        <FileComparisonUploader />

        {/* Create New Link */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Generate Commission Link
            </CardTitle>
            <CardDescription>
              Select a rep and date range to generate a view-only link
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {/* Rep Selector */}
              <div>
                <Label className="mb-2 block">Sales Rep</Label>
                <Select value={selectedCloser} onValueChange={handleRepChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a rep..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableReps?.map((rep) => {
                      const profile = profiles?.find(p => p.id === rep.profile_id);
                      return (
                        <SelectItem key={rep.id} value={rep.name}>
                          <div className="flex items-center gap-2">
                            <span>{rep.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {rep.type}
                            </Badge>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {selectedRepData && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Email: {selectedRepData.email || 'None on file'}
                  </p>
                )}
              </div>

              {/* Date From */}
              <div>
                <Label className="mb-2 block">From Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateFrom && "text-muted-foreground"
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Date To */}
              <div>
                <Label className="mb-2 block">To Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateTo && "text-muted-foreground"
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Commission Percentages */}
            {selectedCloser && (
              <div className="grid gap-4 md:grid-cols-2 pt-2 border-t">
                <div>
                  <Label className="mb-2 block">Closer Commission %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={closerCommission}
                    onChange={(e) => setCloserCommission(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Setter Commission %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={setterCommission}
                    onChange={(e) => setSetterCommission(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Rep Stats Preview */}
            {selectedCloser && (
              <Card className="bg-muted/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    {selectedCloser}'s Stats
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {detailsLoading ? (
                    <p className="text-muted-foreground text-sm">Loading stats...</p>
                  ) : !repStats || repStats.allDeals.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No deals found. Make sure a payout snapshot has been finalized.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 bg-background rounded-lg">
                          <p className="text-xs text-muted-foreground">Closer Deals</p>
                          <p className="text-lg font-bold">{repStats.closerDeals.length}</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(repStats.closerAmount)} collected</p>
                        </div>
                        <div className="p-3 bg-background rounded-lg">
                          <p className="text-xs text-muted-foreground">Setter Deals</p>
                          <p className="text-lg font-bold">{repStats.setterDeals.length}</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(repStats.setterAmount)} collected</p>
                        </div>
                        <div className="p-3 bg-background rounded-lg">
                          <p className="text-xs text-muted-foreground">Closer Payout ({closerCommission}%)</p>
                          <p className="text-lg font-bold text-primary">{formatCurrency(repStats.closerPayout)}</p>
                        </div>
                        <div className="p-3 bg-background rounded-lg">
                          <p className="text-xs text-muted-foreground">Setter Payout ({setterCommission}%)</p>
                          <p className="text-lg font-bold text-primary">{formatCurrency(repStats.setterPayout)}</p>
                        </div>
                      </div>
                      
                      <div className="p-3 bg-primary/10 rounded-lg flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">Total Payout</p>
                          <p className="text-xl font-bold text-primary">{formatCurrency(repStats.totalPayout)}</p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {repStats.allDeals.length} total deals
                        </p>
                      </div>

                      {/* Deals Preview Table */}
                      <div className="max-h-[200px] overflow-y-auto border rounded-lg">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Customer</TableHead>
                              <TableHead>Closer</TableHead>
                              <TableHead>Setter</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                              <TableHead className="text-right">Refund</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {repStats.allDeals.slice(0, 10).map((d) => {
                              const isCloser = d.closer_name?.toLowerCase() === selectedCloser.toLowerCase();
                              const isSetter = d.setter_name?.toLowerCase() === selectedCloser.toLowerCase();
                              return (
                                <TableRow key={d.id}>
                                  <TableCell className="text-sm">
                                    {d.payment_date ? format(new Date(d.payment_date), 'MMM d') : '-'}
                                  </TableCell>
                                  <TableCell className="text-sm">{d.customer_name || '-'}</TableCell>
                                  <TableCell>
                                    {d.closer_name ? (
                                      <Badge variant={isCloser ? 'default' : 'outline'} className="text-xs">
                                        {d.closer_name}
                                      </Badge>
                                    ) : '-'}
                                  </TableCell>
                                  <TableCell>
                                    {d.setter_name ? (
                                      <Badge variant={isSetter ? 'secondary' : 'outline'} className="text-xs">
                                        {d.setter_name}
                                      </Badge>
                                    ) : '-'}
                                  </TableCell>
                                  <TableCell className="text-right text-sm">{formatCurrency(d.amount)}</TableCell>
                                  <TableCell className="text-right text-sm">
                                    {d.refund_amount > 0 ? (
                                      <span className="text-destructive">-{formatCurrency(d.refund_amount)}</span>
                                    ) : '-'}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                        {repStats.allDeals.length > 10 && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            +{repStats.allDeals.length - 10} more deals
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Email Option */}
            {selectedCloser && (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="send-email" 
                    checked={sendEmail} 
                    onCheckedChange={(checked) => setSendEmail(checked === true)}
                  />
                  <Label htmlFor="send-email" className="cursor-pointer">
                    Email the link to this rep
                  </Label>
                </div>
                
                {sendEmail && (
                  <Input
                    type="email"
                    placeholder="Enter email address..."
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                  />
                )}
              </div>
            )}

            <Button 
              onClick={handleCreateLink} 
              disabled={!selectedCloser || createLink.isPending || (sendEmail && !emailAddress)}
            >
              {sendEmail ? (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Generate & Email Link
                </>
              ) : (
                <>
                  <Link2 className="mr-2 h-4 w-4" />
                  Generate Link
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Manage Reps - Collapsible */}
        <details className="mb-6 group">
          <summary className="cursor-pointer list-none">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Manage Reps
                  </CardTitle>
                  <CardDescription>
                    Add new reps or remove inactive ones
                  </CardDescription>
                </div>
                <ChevronDown className="h-5 w-5 transition-transform group-open:rotate-180" />
              </CardHeader>
            </Card>
          </summary>
          <Card className="border-t-0 rounded-t-none -mt-2">
            <CardContent className="pt-4 space-y-4">
              {/* Add new rep */}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="mb-2 block">New Rep Name</Label>
                  <Input
                    placeholder="Enter name..."
                    value={newRepName}
                    onChange={(e) => setNewRepName(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Type</Label>
                  <Select value={newRepType} onValueChange={(v) => setNewRepType(v as 'closer' | 'setter')}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="closer">Closer</SelectItem>
                      <SelectItem value="setter">Setter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  onClick={() => newRepName && addRep.mutate({ name: newRepName, type: newRepType })}
                  disabled={!newRepName || addRep.isPending}
                >
                  Add Rep
                </Button>
              </div>

              {/* List of reps with remove option */}
              {allReps && allReps.length > 0 && (
                <div className="border rounded-md max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allReps.map((rep) => (
                        <TableRow key={`${rep.type}-${rep.id}`}>
                          <TableCell className="font-medium">{rep.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{rep.type}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeRep.mutate({ id: rep.id, type: rep.type })}
                              disabled={removeRep.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </details>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Active Commission Links
            </CardTitle>
            <CardDescription>
              Links that reps can use to view their commission reports
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!existingLinks || existingLinks.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No commission links created yet. Generate one above!
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rep Name</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {existingLinks.map((link) => {
                      const email = getEmailForRep(link.closer_name);
                      return (
                        <TableRow key={link.id}>
                          <TableCell className="font-medium">
                            <div>
                              {link.closer_name}
                              {email && (
                                <p className="text-xs text-muted-foreground">{email}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(link.created_at), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {link.last_used_at 
                              ? format(new Date(link.last_used_at), 'MMM d, yyyy h:mm a')
                              : 'Never'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={link.is_active ? 'default' : 'secondary'}>
                              {link.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(link.token, link.id)}
                                title="Copy link"
                              >
                                {copiedId === link.id ? (
                                  <Check className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                title="Preview"
                              >
                                <a 
                                  href={getFullLink(link.token)} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                >
                                  <Eye className="h-4 w-4" />
                                </a>
                              </Button>
                              {email && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => sendEmailForLink.mutate({ link, email })}
                                  disabled={sendingEmailId === link.id}
                                  title="Email link"
                                >
                                  <Mail className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteLink.mutate(link.id)}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
