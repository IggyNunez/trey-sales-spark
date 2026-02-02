export interface MetricFilter {
  type: 'total' | 'showed' | 'deals' | 'callType' | 'source' | 'platform' | 'closer' | 'setter' | 'trafficSource' | 'attributionNode';
  value?: string;
  dateType?: 'scheduled' | 'booked';
  label: string;
  closerEmail?: string;
  selectedPlatform?: string | null;
  attributionSource?: 'crm' | 'utm' | 'quiz' | 'ighandle';
  // For attribution node drill-downs
  platform?: string;
  channel?: string;
  setter?: string;
  capitalTier?: string;
}
