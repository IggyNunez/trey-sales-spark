import { useState, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import ExcelJS from 'exceljs';
import Tesseract from 'tesseract.js';
import { Upload, FileSpreadsheet, X, Image, CheckCircle2, AlertCircle, Loader2, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ParsedRow {
  name: string;
  amount: number;
  rawName: string;
  rawAmount: string;
}

interface PaymentData {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  amount: number;
  refund_amount: number | null;
  payment_date: string;
  closer_name: string | null;
  setter_name: string | null;
}

interface ComparisonResult {
  uploadedData: ParsedRow[];
  totalUploaded: number;
  fileName: string;
}

interface SystemCustomer {
  name: string;
  email: string | null;
  amount: number;
  searchTerms: string[]; // All searchable terms
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

// Parse currency string to number
const parseCurrencyString = (value: string): number => {
  if (!value) return 0;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

// Normalize name for comparison
const normalizeName = (name: string): string => {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ');
};

// Extract searchable terms from customer data
const getSearchTerms = (name: string | null, email: string | null): string[] => {
  const terms: string[] = [];
  
  if (name) {
    const normalized = normalizeName(name);
    terms.push(normalized);
    // Add individual words
    normalized.split(' ').forEach(word => {
      if (word.length > 2) terms.push(word);
    });
  }
  
  if (email) {
    // Extract username from email
    const username = email.split('@')[0]?.toLowerCase() || '';
    if (username.length > 2) {
      terms.push(username);
      // Try to split username by common patterns
      // e.g., "xavierrobinson" -> ["xavier", "robinson"] if we can detect camelCase or common patterns
      // Simple approach: look for capital letters or common separators
      const parts = username.split(/[._\-]/);
      parts.forEach(part => {
        if (part.length > 2) terms.push(part);
      });
    }
  }
  
  return [...new Set(terms)];
};

// Fuzzy match names - checks for any overlap in search terms
const fuzzyMatchName = (uploadedName: string, systemCustomers: SystemCustomer[]): { customer: SystemCustomer; matchedOn: string } | null => {
  const normalizedUploaded = normalizeName(uploadedName);
  const uploadedParts = normalizedUploaded.split(' ').filter(p => p.length > 2);
  
  for (const customer of systemCustomers) {
    // Check each search term for the customer
    for (const term of customer.searchTerms) {
      // Exact match on full name
      if (term === normalizedUploaded) {
        return { customer, matchedOn: 'exact name' };
      }
      
      // Any uploaded part matches any search term
      for (const uploadedPart of uploadedParts) {
        if (term === uploadedPart) {
          return { customer, matchedOn: `"${uploadedPart}"` };
        }
        // Partial match - one contains the other
        if (uploadedPart.length > 3 && term.includes(uploadedPart)) {
          return { customer, matchedOn: `"${uploadedPart}" in "${term}"` };
        }
        if (term.length > 3 && uploadedPart.includes(term)) {
          return { customer, matchedOn: `"${term}" in "${uploadedPart}"` };
        }
      }
    }
    
    // Also try matching the raw uploaded name against search terms
    for (const term of customer.searchTerms) {
      if (term.length > 3 && normalizedUploaded.includes(term)) {
        return { customer, matchedOn: `"${term}"` };
      }
    }
  }
  
  return null;
};

export default function FileComparisonUploader() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [selectedRep, setSelectedRep] = useState<string>('');
  
  // Date range state - default to last month
  const [dateFrom, setDateFrom] = useState<Date | undefined>(startOfMonth(subMonths(new Date(), 1)));
  const [dateTo, setDateTo] = useState<Date | undefined>(endOfMonth(subMonths(new Date(), 1)));

  // Fetch all reps for the selector
  const { data: allReps } = useQuery({
    queryKey: ['reps-for-comparison', orgId],
    queryFn: async () => {
      const { data: closersData } = await supabase
        .from('closers')
        .select('id, name')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('name');

      const { data: settersData } = await supabase
        .from('setters')
        .select('id, name')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('name');

      const names = new Set<string>();
      const reps: { name: string }[] = [];

      closersData?.forEach(c => {
        if (!names.has(c.name.toLowerCase())) {
          names.add(c.name.toLowerCase());
          reps.push({ name: c.name });
        }
      });

      settersData?.forEach(s => {
        if (!names.has(s.name.toLowerCase())) {
          names.add(s.name.toLowerCase());
          reps.push({ name: s.name });
        }
      });

      return reps.sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: !!orgId,
  });

  // Fetch payout snapshot details for selected rep with date filter (same source as My Commissions page)
  const { data: repData, isLoading: repDataLoading } = useQuery({
    queryKey: ['rep-comparison-data', selectedRep, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      // Query payout_snapshot_details - EXACTLY same as RepCommissionsPage (no org filter)
      const { data, error } = await supabase
        .from('payout_snapshot_details')
        .select('*')
        .or(`closer_name.ilike.%${selectedRep}%,setter_name.ilike.%${selectedRep}%`)
        .order('payment_date', { ascending: false });
      
      if (error) throw error;
      if (!data) return [];
      
      // Filter by date range using EST boundaries (same as RepCommissionsPage)
      const startBoundary = new Date(dateFrom!);
      startBoundary.setUTCHours(5, 0, 0, 0); // Midnight EST = 5 AM UTC
      
      const endBoundary = new Date(dateTo!);
      endBoundary.setDate(endBoundary.getDate() + 1);
      endBoundary.setUTCHours(4, 59, 59, 999); // 11:59:59 PM EST = 4:59:59 AM UTC next day
      
      const filtered = data.filter((d: any) => {
        if (!d.payment_date) return true;
        const paymentDate = new Date(d.payment_date);
        return paymentDate >= startBoundary && paymentDate <= endBoundary;
      });
      
      // Map to expected format
      const payments: PaymentData[] = filtered.map((p: any) => ({
        id: p.id,
        customer_name: p.customer_name,
        customer_email: p.customer_email,
        amount: p.amount || 0,
        refund_amount: p.refund_amount || 0,
        payment_date: p.payment_date,
        closer_name: p.closer_name,
        setter_name: p.setter_name,
      }));
      
      return payments;
    },
    enabled: !!selectedRep && !!dateFrom && !!dateTo,
  });

  // Calculate rep totals and build customer list for comparison
  const comparisonStats = useMemo(() => {
    if (!repData || !selectedRep) return null;

    const asCloser = repData.filter(d => d.closer_name?.toLowerCase() === selectedRep.toLowerCase());
    const asSetter = repData.filter(d => d.setter_name?.toLowerCase() === selectedRep.toLowerCase());

    const closerTotal = asCloser.reduce((sum, d) => sum + d.amount, 0);
    const closerRefunds = asCloser.reduce((sum, d) => sum + (d.refund_amount || 0), 0);
    const setterTotal = asSetter.reduce((sum, d) => sum + d.amount, 0);
    const setterRefunds = asSetter.reduce((sum, d) => sum + (d.refund_amount || 0), 0);

    // Build customer list with search terms
    const customerMap = new Map<string, SystemCustomer>();
    [...asCloser, ...asSetter].forEach(d => {
      const key = `${d.customer_name || ''}-${d.customer_email || ''}`.toLowerCase();
      const existing = customerMap.get(key);
      if (existing) {
        existing.amount += d.amount;
      } else {
        customerMap.set(key, {
          name: d.customer_name || d.customer_email || 'Unknown',
          email: d.customer_email,
          amount: d.amount,
          searchTerms: getSearchTerms(d.customer_name, d.customer_email),
        });
      }
    });

    return {
      closerTotal,
      closerRefunds,
      closerNet: closerTotal - closerRefunds,
      closerCount: asCloser.length,
      setterTotal,
      setterRefunds,
      setterNet: setterTotal - setterRefunds,
      setterCount: asSetter.length,
      totalNet: (closerTotal - closerRefunds) + (setterTotal - setterRefunds),
      systemCustomers: Array.from(customerMap.values()),
    };
  }, [repData, selectedRep]);

  // Match uploaded data with system data using fuzzy matching
  const matchResults = useMemo(() => {
    if (!comparisonResult || !comparisonStats) return null;

    const matches: { 
      uploaded: ParsedRow; 
      systemAmount: number | null; 
      matchedName: string | null;
      matchedOn: string | null;
      status: 'match' | 'mismatch' | 'not_found';
    }[] = [];
    
    for (const row of comparisonResult.uploadedData) {
      const fuzzyMatch = fuzzyMatchName(row.rawName, comparisonStats.systemCustomers);
      
      if (!fuzzyMatch) {
        matches.push({ uploaded: row, systemAmount: null, matchedName: null, matchedOn: null, status: 'not_found' });
      } else if (Math.abs(fuzzyMatch.customer.amount - row.amount) < 1) {
        matches.push({ 
          uploaded: row, 
          systemAmount: fuzzyMatch.customer.amount, 
          matchedName: fuzzyMatch.customer.name,
          matchedOn: fuzzyMatch.matchedOn,
          status: 'match' 
        });
      } else {
        matches.push({ 
          uploaded: row, 
          systemAmount: fuzzyMatch.customer.amount, 
          matchedName: fuzzyMatch.customer.name,
          matchedOn: fuzzyMatch.matchedOn,
          status: 'mismatch' 
        });
      }
    }

    const matchCount = matches.filter(m => m.status === 'match').length;
    const mismatchCount = matches.filter(m => m.status === 'mismatch').length;
    const notFoundCount = matches.filter(m => m.status === 'not_found').length;

    return { matches, matchCount, mismatchCount, notFoundCount };
  }, [comparisonResult, comparisonStats]);

  const processExcelFile = async (file: File): Promise<ParsedRow[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (extension === 'csv') {
      // For CSV files, read as text and parse manually
      const text = await file.text();
      const lines = text.split('\n').map(line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')));
      const rows: ParsedRow[] = [];
      
      for (const row of lines) {
        if (!row || row.length < 2) continue;
        
        let name = '';
        let amount = 0;
        let rawName = '';
        let rawAmount = '';

        for (const cell of row) {
          if (cell === null || cell === undefined) continue;
          
          const cellStr = String(cell).trim();
          
          if (/^\$?[\d,]+\.?\d*$/.test(cellStr.replace(/,/g, ''))) {
            amount = parseCurrencyString(cellStr);
            rawAmount = cellStr;
          } else if (cellStr && !name && cellStr.length > 1) {
            if (['name', 'client', 'customer', 'amount', 'total', 'payment'].includes(cellStr.toLowerCase())) {
              continue;
            }
            name = cellStr;
            rawName = cellStr;
          }
        }

        if (name && amount > 0) {
          rows.push({ name: normalizeName(name), amount, rawName, rawAmount });
        }
      }
      
      return rows;
    }
    
    // For xlsx/xls files, use ExcelJS
    await workbook.xlsx.load(arrayBuffer);
    const worksheet = workbook.worksheets[0];
    
    if (!worksheet) {
      return [];
    }

    const rows: ParsedRow[] = [];
    
    worksheet.eachRow((row) => {
      let name = '';
      let amount = 0;
      let rawName = '';
      let rawAmount = '';

      row.eachCell((cell) => {
        const cellValue = cell.value;
        if (cellValue === null || cellValue === undefined) return;
        
        const cellStr = String(cellValue).trim();
        
        if (/^\$?[\d,]+\.?\d*$/.test(cellStr.replace(/,/g, ''))) {
          amount = parseCurrencyString(cellStr);
          rawAmount = cellStr;
        } else if (typeof cellValue === 'number') {
          amount = cellValue;
          rawAmount = String(cellValue);
        } else if (cellStr && !name && cellStr.length > 1) {
          if (['name', 'client', 'customer', 'amount', 'total', 'payment'].includes(cellStr.toLowerCase())) {
            return;
          }
          name = cellStr;
          rawName = cellStr;
        }
      });

      if (name && amount > 0) {
        rows.push({ name: normalizeName(name), amount, rawName, rawAmount });
      }
    });

    return rows;
  };

  const processImageFile = async (file: File): Promise<ParsedRow[]> => {
    setProcessingStatus('Analyzing image with OCR...');
    
    const result = await Tesseract.recognize(file, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          setProcessingStatus(`Analyzing image... ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    setProcessingStatus('Extracting data...');
    const text = result.data.text;
    const lines = text.split('\n').filter(line => line.trim());

    const rows: ParsedRow[] = [];

    for (const line of lines) {
      const amountMatch = line.match(/\$?([\d,]+(?:\.\d{2})?)/);
      if (!amountMatch) continue;

      const amount = parseCurrencyString(amountMatch[1]);
      if (amount <= 0) continue;

      const amountIndex = line.indexOf(amountMatch[0]);
      let name = line.substring(0, amountIndex).trim();
      
      name = name.replace(/[|\\\/\[\]{}()]/g, '').trim();
      
      if (name.length < 2) continue;
      if (['name', 'client', 'customer', 'amount', 'total', 'payment'].includes(name.toLowerCase())) continue;

      rows.push({
        name: normalizeName(name),
        amount,
        rawName: name,
        rawAmount: amountMatch[0],
      });
    }

    return rows;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setProcessingStatus('');

    try {
      const fileName = file.name;
      const extension = fileName.split('.').pop()?.toLowerCase();

      let parsedRows: ParsedRow[] = [];

      if (['xlsx', 'xls', 'csv'].includes(extension || '')) {
        setProcessingStatus('Processing spreadsheet...');
        parsedRows = await processExcelFile(file);
      } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(extension || '')) {
        parsedRows = await processImageFile(file);
      } else {
        toast({
          title: 'Unsupported file type',
          description: 'Please upload a spreadsheet or image file',
          variant: 'destructive',
        });
        setIsProcessing(false);
        return;
      }

      if (parsedRows.length === 0) {
        toast({
          title: 'No data found',
          description: 'Could not find any name/amount pairs in the file',
          variant: 'destructive',
        });
        setIsProcessing(false);
        return;
      }

      const totalUploaded = parsedRows.reduce((sum, row) => sum + row.amount, 0);

      setComparisonResult({
        uploadedData: parsedRows,
        totalUploaded,
        fileName,
      });

      toast({
        title: 'File processed!',
        description: `Found ${parsedRows.length} entries totaling ${formatCurrency(totalUploaded)}`,
      });
    } catch (error) {
      console.error('File processing error:', error);
      toast({
        title: 'Failed to process file',
        description: 'Please try a different file or format',
        variant: 'destructive',
      });
    }

    setIsProcessing(false);
    setProcessingStatus('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearComparison = () => {
    setComparisonResult(null);
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Cross-Reference Rep Data
        </CardTitle>
        <CardDescription>
          Upload a spreadsheet or screenshot from your rep to compare names and amounts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Rep Selector and Date Range */}
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label className="mb-2 block">Select Rep</Label>
            <Select value={selectedRep} onValueChange={setSelectedRep}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a rep..." />
              </SelectTrigger>
              <SelectContent>
                {allReps?.map((rep) => (
                  <SelectItem key={rep.name} value={rep.name}>
                    {rep.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
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
                  {dateFrom ? format(dateFrom, "MMM d, yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          
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
                  {dateTo ? format(dateTo, "MMM d, yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={dateTo}
                  onSelect={setDateTo}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* System Data Summary for Selected Rep */}
        {selectedRep && repDataLoading && (
          <div className="grid gap-3 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="bg-muted/50 animate-pulse">
                <CardContent className="pt-4">
                  <div className="h-3 w-16 bg-muted rounded mb-2"></div>
                  <div className="h-6 w-24 bg-muted rounded mb-1"></div>
                  <div className="h-3 w-20 bg-muted rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {selectedRep && !repDataLoading && comparisonStats && (
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="bg-muted/50">
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">As Closer</div>
                <div className="text-lg font-bold">{formatCurrency(comparisonStats.closerNet)}</div>
                <div className="text-xs text-muted-foreground">{comparisonStats.closerCount} payments</div>
              </CardContent>
            </Card>
            <Card className="bg-muted/50">
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">As Setter</div>
                <div className="text-lg font-bold">{formatCurrency(comparisonStats.setterNet)}</div>
                <div className="text-xs text-muted-foreground">{comparisonStats.setterCount} payments</div>
              </CardContent>
            </Card>
            <Card className="bg-muted/50">
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">System Total</div>
                <div className="text-lg font-bold">{formatCurrency(comparisonStats.totalNet)}</div>
                <div className="text-xs text-muted-foreground">
                  {comparisonStats.systemCustomers.length} customers
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {!comparisonResult ? (
          <div 
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
              selectedRep ? "hover:border-primary/50" : "opacity-50 cursor-not-allowed"
            )}
            onClick={() => selectedRep && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.gif,.bmp"
              onChange={handleFileUpload}
              className="hidden"
              disabled={!selectedRep}
            />
            {isProcessing ? (
              <>
                <Loader2 className="h-10 w-10 mx-auto mb-3 text-primary animate-spin" />
                <p className="text-sm font-medium">{processingStatus || 'Processing...'}</p>
              </>
            ) : (
              <>
                <div className="flex justify-center gap-2 mb-3">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <Image className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">
                  {selectedRep ? 'Click to upload file or screenshot' : 'Select a rep first'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Excel, CSV, or image files (PNG, JPG) supported
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* File Info Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <span className="font-medium">{comparisonResult.fileName}</span>
                <Badge variant="outline">
                  {comparisonResult.uploadedData.length} entries
                </Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={clearComparison}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>

            {/* Comparison Summary */}
            <div className="grid gap-3 md:grid-cols-4">
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground">Uploaded Total</div>
                  <div className="text-lg font-bold">{formatCurrency(comparisonResult.totalUploaded)}</div>
                </CardContent>
              </Card>
              {matchResults && (
                <>
                  <Card className="bg-green-500/10 border-green-500/20">
                    <CardContent className="pt-4">
                      <div className="text-xs text-green-600">Matches</div>
                      <div className="text-lg font-bold text-green-600">{matchResults.matchCount}</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-yellow-500/10 border-yellow-500/20">
                    <CardContent className="pt-4">
                      <div className="text-xs text-yellow-600">Mismatches</div>
                      <div className="text-lg font-bold text-yellow-600">{matchResults.mismatchCount}</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-red-500/10 border-red-500/20">
                    <CardContent className="pt-4">
                      <div className="text-xs text-red-600">Not in System</div>
                      <div className="text-lg font-bold text-red-600">{matchResults.notFoundCount}</div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* Difference */}
            {comparisonStats && (
              <Card className={cn(
                "border-2",
                Math.abs(comparisonResult.totalUploaded - comparisonStats.totalNet) < 10 
                  ? "border-green-500/50 bg-green-500/5" 
                  : "border-yellow-500/50 bg-yellow-500/5"
              )}>
                <CardContent className="pt-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium">Total Difference</div>
                      <div className="text-xs text-muted-foreground">
                        Uploaded vs System
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">
                        {formatCurrency(Math.abs(comparisonResult.totalUploaded - comparisonStats.totalNet))}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {comparisonResult.totalUploaded > comparisonStats.totalNet ? 'Rep claims more' : 'System shows more'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Data Table with Comparison */}
            <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Customer Name</TableHead>
                    <TableHead className="text-right">Uploaded</TableHead>
                    <TableHead className="text-right">System</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matchResults?.matches.map((match, idx) => (
                    <TableRow key={idx} className={cn(
                      match.status === 'match' && "bg-green-500/5",
                      match.status === 'mismatch' && "bg-yellow-500/5",
                      match.status === 'not_found' && "bg-red-500/5"
                    )}>
                      <TableCell>
                        {match.status === 'match' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                        {match.status === 'mismatch' && <AlertCircle className="h-4 w-4 text-yellow-500" />}
                        {match.status === 'not_found' && <AlertCircle className="h-4 w-4 text-red-500" />}
                      </TableCell>
                      <TableCell>
                        <div>{match.uploaded.rawName}</div>
                        {match.matchedName && (
                          <div className="text-xs text-muted-foreground">
                            → {match.matchedName} {match.matchedOn && `(via ${match.matchedOn})`}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{match.uploaded.rawAmount}</TableCell>
                      <TableCell className="text-right font-mono">
                        {match.systemAmount !== null ? formatCurrency(match.systemAmount) : '—'}
                      </TableCell>
                    </TableRow>
                  )) || comparisonResult.uploadedData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell></TableCell>
                      <TableCell>{row.rawName}</TableCell>
                      <TableCell className="text-right font-mono">{row.rawAmount}</TableCell>
                      <TableCell className="text-right font-mono">—</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
