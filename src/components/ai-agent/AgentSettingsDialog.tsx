import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TrialStatus, AgentSettings } from '@/hooks/useReportsAgent';
import { AlertCircle, Clock, Key, Sparkles } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AgentSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trialStatus: TrialStatus | null;
  onSave: (settings: AgentSettings) => Promise<boolean>;
}

type Provider = 'openai' | 'gemini' | 'claude';

export function AgentSettingsDialog({
  open,
  onOpenChange,
  trialStatus,
  onSave,
}: AgentSettingsDialogProps) {
  const [provider, setProvider] = useState<Provider | ''>('');
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!provider || !apiKey.trim()) return;

    setIsSaving(true);
    const success = await onSave({
      preferredProvider: provider,
      customApiKey: apiKey.trim(),
    });
    setIsSaving(false);

    if (success) {
      setApiKey('');
    }
  };

  const getProviderInfo = (p: Provider) => {
    switch (p) {
      case 'openai':
        return {
          name: 'OpenAI',
          keyPrefix: 'sk-',
          placeholder: 'sk-...',
          description: 'GPT-4o-mini recommended for best results',
        };
      case 'gemini':
        return {
          name: 'Google Gemini',
          keyPrefix: 'AI',
          placeholder: 'AIza...',
          description: 'Gemini 2.5 Flash for fast responses',
        };
      case 'claude':
        return {
          name: 'Anthropic Claude',
          keyPrefix: 'sk-ant',
          placeholder: 'sk-ant-...',
          description: 'Claude 3 Sonnet for detailed analysis',
        };
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            AI Reports Agent Settings
          </DialogTitle>
          <DialogDescription>
            Configure your AI provider to continue using the Reports Agent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Trial Status */}
          {trialStatus && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                {trialStatus.isTrialActive ? (
                  <>
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span>Trial Active</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-4 w-4 text-destructive" />
                    <span>Trial Expired</span>
                  </>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {trialStatus.isTrialActive ? (
                  <span>{trialStatus.daysRemaining} days remaining</span>
                ) : (
                  <span>Add your API key to continue</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Total queries: {trialStatus.apiCallsCount}
              </div>
            </div>
          )}

          {!trialStatus?.isTrialActive && !trialStatus?.hasCustomKey && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Your trial has ended. Please add an API key from one of the supported providers to
                continue using the Reports Agent.
              </AlertDescription>
            </Alert>
          )}

          {/* Provider Selection */}
          <div className="space-y-2">
            <Label htmlFor="provider">AI Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI (GPT-4o-mini)</SelectItem>
                <SelectItem value="gemini">Google Gemini</SelectItem>
                <SelectItem value="claude">Anthropic Claude</SelectItem>
              </SelectContent>
            </Select>
            {provider && (
              <p className="text-xs text-muted-foreground">
                {getProviderInfo(provider).description}
              </p>
            )}
          </div>

          {/* API Key Input */}
          {provider && (
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder={getProviderInfo(provider).placeholder}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Your API key is encrypted and stored securely.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!provider || !apiKey.trim() || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
