import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useOrganization } from './useOrganization';
import { toast } from '@/hooks/use-toast';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface TrialStatus {
  isTrialActive: boolean;
  daysRemaining: number;
  hasCustomKey: boolean;
  apiCallsCount: number;
}

export interface AgentSettings {
  preferredProvider: 'openai' | 'gemini' | 'claude' | null;
  customApiKey: string;
}

export function useReportsAgent() {
  const { user, session, isAdmin, isSuperAdmin } = useAuth();
  const { currentOrganization } = useOrganization();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const isAuthorized = isAdmin || isSuperAdmin;

  // Fetch initial trial status
  useEffect(() => {
    if (user && currentOrganization && isAuthorized) {
      fetchTrialStatus();
    }
  }, [user, currentOrganization, isAuthorized]);

  const fetchTrialStatus = async () => {
    if (!currentOrganization) return;

    try {
      const { data, error } = await supabase
        .from('ai_agent_trials')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .eq('user_id', user?.id)
        .maybeSingle();

      if (data) {
        const now = new Date();
        const trialEnds = new Date(data.trial_ends_at);
        const isTrialActive = now < trialEnds;
        const daysRemaining = isTrialActive 
          ? Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        setTrialStatus({
          isTrialActive,
          daysRemaining,
          hasCustomKey: !!data.custom_api_key_encrypted,
          apiCallsCount: data.api_calls_count || 0,
        });
      }
    } catch (error) {
      console.error('Error fetching trial status:', error);
    }
  };

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || !currentOrganization || !session) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/report-agent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            message: content.trim(),
            organizationId: currentOrganization.id,
            conversationHistory: messages.map(m => ({
              role: m.role,
              content: m.content,
            })),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (data.trialExpired) {
          setShowSettings(true);
          toast({
            title: 'Trial Expired',
            description: data.message,
            variant: 'destructive',
          });
        } else if (response.status === 429) {
          toast({
            title: 'Rate Limited',
            description: 'Please wait a moment before sending another message.',
            variant: 'destructive',
          });
        } else {
          throw new Error(data.error || 'Failed to get response');
        }
        return;
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (data.trialStatus) {
        setTrialStatus(data.trialStatus);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send message',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization, session, messages]);

  const saveApiKey = useCallback(async (settings: AgentSettings) => {
    if (!currentOrganization || !user) return false;

    try {
      // Simple base64 encoding (should use proper encryption in production)
      const encryptedKey = settings.customApiKey ? btoa(settings.customApiKey) : null;

      const { error } = await supabase
        .from('ai_agent_trials')
        .update({
          custom_api_key_encrypted: encryptedKey,
          preferred_provider: settings.preferredProvider,
        })
        .eq('organization_id', currentOrganization.id)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: 'Settings Saved',
        description: 'Your API key has been saved successfully.',
      });

      await fetchTrialStatus();
      setShowSettings(false);
      return true;
    } catch (error) {
      console.error('Error saving API key:', error);
      toast({
        title: 'Error',
        description: 'Failed to save API key',
        variant: 'destructive',
      });
      return false;
    }
  }, [currentOrganization, user]);

  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  const toggleOpen = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  return {
    messages,
    isLoading,
    trialStatus,
    isOpen,
    showSettings,
    isAuthorized,
    sendMessage,
    saveApiKey,
    clearHistory,
    toggleOpen,
    setShowSettings,
  };
}
