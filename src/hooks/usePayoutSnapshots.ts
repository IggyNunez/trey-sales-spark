import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOrganization } from "./useOrganization";

export interface PayoutSnapshot {
  id: string;
  name: string;
  period_start: string;
  period_end: string;
  status: string;
  total_revenue: number;
  total_refunds: number;
  net_revenue: number;
  created_at: string;
  finalized_at: string | null;
  notes: string | null;
  organization_id: string | null;
}

export interface PayoutSnapshotSummary {
  id: string;
  snapshot_id: string;
  summary_type: string;
  entity_id: string | null;
  entity_name: string;
  total_revenue: number;
  total_refunds: number;
  net_revenue: number;
  payment_count: number;
}

export interface PayoutSnapshotDetail {
  id: string;
  snapshot_id: string;
  payment_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  amount: number;
  refund_amount: number;
  net_amount: number;
  payment_date: string | null;
  setter_id: string | null;
  setter_name: string | null;
  closer_id: string | null;
  closer_name: string | null;
  source_id: string | null;
  source_name: string | null;
  traffic_type_id: string | null;
  traffic_type_name: string | null;
  whop_connection_id: string | null;
  whop_connection_name: string | null;
}

export function usePayoutSnapshots() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['payout-snapshots', orgId],
    queryFn: async () => {
      let query = supabase
        .from('payout_snapshots')
        .select('*')
        .order('period_start', { ascending: false });
      
      if (orgId) {
        query = query.eq('organization_id', orgId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as PayoutSnapshot[];
    },
    enabled: !!orgId,
  });
}

export function usePayoutSnapshotDetails(snapshotId: string | null) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['payout-snapshot-details', snapshotId, orgId],
    queryFn: async () => {
      if (!snapshotId) return { summaries: [], details: [] };

      // CRITICAL: First verify the snapshot belongs to this organization
      if (orgId) {
        const { data: snapshot, error: verifyError } = await supabase
          .from('payout_snapshots')
          .select('id')
          .eq('id', snapshotId)
          .eq('organization_id', orgId)
          .maybeSingle();

        if (verifyError) throw verifyError;
        if (!snapshot) {
          throw new Error('Snapshot not found or access denied');
        }
      }

      const [summariesRes, detailsRes] = await Promise.all([
        supabase
          .from('payout_snapshot_summaries')
          .select('*')
          .eq('snapshot_id', snapshotId)
          .order('net_revenue', { ascending: false }),
        supabase
          .from('payout_snapshot_details')
          .select('*')
          .eq('snapshot_id', snapshotId)
          .order('payment_date', { ascending: false }),
      ]);

      if (summariesRes.error) throw summariesRes.error;
      if (detailsRes.error) throw detailsRes.error;

      return {
        summaries: summariesRes.data as PayoutSnapshotSummary[],
        details: detailsRes.data as PayoutSnapshotDetail[],
      };
    },
    enabled: !!snapshotId && !!orgId,
  });
}

export function useCreatePayoutSnapshot() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ periodStart, periodEnd, name }: { periodStart: string; periodEnd: string; name?: string }) => {
      const { data, error } = await supabase.functions.invoke('create-payout-snapshot', {
        body: { periodStart, periodEnd, name },
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['payout-snapshots'] });
      toast.success(`Snapshot created with ${data.paymentCount} payments`);
    },
    onError: (error) => {
      toast.error(`Failed to create snapshot: ${error.message}`);
    },
  });
}

export function useFinalizeSnapshot() {
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async (snapshotId: string) => {
      // CRITICAL: Include org filter to prevent cross-org updates
      let query = supabase
        .from('payout_snapshots')
        .update({
          status: 'finalized',
          finalized_at: new Date().toISOString(),
        })
        .eq('id', snapshotId);

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { error } = await query;

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payout-snapshots'] });
      toast.success('Snapshot finalized');
    },
    onError: (error) => {
      toast.error(`Failed to finalize: ${error.message}`);
    },
  });
}

export function useDeleteSnapshot() {
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async (snapshotId: string) => {
      // CRITICAL: Include org filter to prevent cross-org deletes
      let query = supabase
        .from('payout_snapshots')
        .delete()
        .eq('id', snapshotId);

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { error } = await query;

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payout-snapshots'] });
      toast.success('Snapshot deleted');
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });
}

export function useRemoveSnapshotDetail() {
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async ({ detailId, snapshotId }: { detailId: string; snapshotId: string }) => {
      // CRITICAL: First verify the snapshot belongs to this organization
      if (orgId) {
        const { data: verifySnapshot, error: verifyError } = await supabase
          .from('payout_snapshots')
          .select('id')
          .eq('id', snapshotId)
          .eq('organization_id', orgId)
          .maybeSingle();

        if (verifyError) throw verifyError;
        if (!verifySnapshot) {
          throw new Error('Snapshot not found or access denied');
        }
      }

      // First get the detail to know the amounts
      const { data: detail, error: fetchError } = await supabase
        .from('payout_snapshot_details')
        .select('amount, refund_amount, net_amount')
        .eq('id', detailId)
        .single();

      if (fetchError) throw fetchError;

      // Delete the detail
      const { error: deleteError } = await supabase
        .from('payout_snapshot_details')
        .delete()
        .eq('id', detailId);

      if (deleteError) throw deleteError;

      // Update the snapshot totals with org filter
      let snapshotQuery = supabase
        .from('payout_snapshots')
        .select('total_revenue, total_refunds, net_revenue')
        .eq('id', snapshotId);

      if (orgId) {
        snapshotQuery = snapshotQuery.eq('organization_id', orgId);
      }

      const { data: snapshot, error: snapshotFetchError } = await snapshotQuery.single();

      if (snapshotFetchError) throw snapshotFetchError;

      // Safely parse and validate numbers to prevent NaN
      const parseNumber = (value: any): number => {
        const num = parseFloat(value);
        if (isNaN(num)) {
          throw new Error(`Invalid number value: ${value}`);
        }
        return num;
      };

      const totalRevenue = parseNumber(snapshot.total_revenue) - parseNumber(detail.amount);
      const totalRefunds = parseNumber(snapshot.total_refunds) - parseNumber(detail.refund_amount);
      const netRevenue = parseNumber(snapshot.net_revenue) - parseNumber(detail.net_amount);

      let updateQuery = supabase
        .from('payout_snapshots')
        .update({
          total_revenue: totalRevenue,
          total_refunds: totalRefunds,
          net_revenue: netRevenue,
        })
        .eq('id', snapshotId);

      if (orgId) {
        updateQuery = updateQuery.eq('organization_id', orgId);
      }

      const { error: updateError } = await updateQuery;

      if (updateError) throw updateError;
    },
    onSuccess: (_, { snapshotId }) => {
      queryClient.invalidateQueries({ queryKey: ['payout-snapshots'] });
      queryClient.invalidateQueries({ queryKey: ['payout-snapshot-details', snapshotId] });
      toast.success('Payment removed from snapshot');
    },
    onError: (error) => {
      toast.error(`Failed to remove: ${error.message}`);
    },
  });
}

export function useUpdatePaymentDate() {
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async ({ paymentId, newDate }: { paymentId: string; newDate: string }) => {
      // CRITICAL: Include org filter to prevent cross-org updates
      let query = supabase
        .from('payments')
        .update({ payment_date: newDate })
        .eq('id', paymentId);

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { error } = await query;

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attribution-payments'] });
      queryClient.invalidateQueries({ queryKey: ['attribution-refunds'] });
      toast.success('Payment date updated');
    },
    onError: (error) => {
      toast.error(`Failed to update date: ${error.message}`);
    },
  });
}
