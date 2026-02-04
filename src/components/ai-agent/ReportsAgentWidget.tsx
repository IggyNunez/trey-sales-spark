import { useState, useRef, useEffect } from 'react';
import { useReportsAgent } from '@/hooks/useReportsAgent';
import { MessageBubble } from './MessageBubble';
import { AgentSettingsDialog } from './AgentSettingsDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Bot,
  X,
  Send,
  Settings,
  Trash2,
  Loader2,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ReportsAgentWidget() {
  const {
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
  } = useReportsAgent();

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Don't render for non-authorized users
  if (!isAuthorized) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input);
      setInput('');
    }
  };

  const welcomeMessage = {
    role: 'assistant' as const,
    content: `👋 Hi! I'm your **Reports Agent**. I can help you quickly access data and insights about your organization.

Try asking me things like:
- "How many calls were scheduled this month?"
- "What's our show rate for the last 30 days?"
- "Show me revenue by closer"
- "List top 5 lead sources"

${trialStatus?.isTrialActive ? `✨ You have **${trialStatus.daysRemaining} days** left in your trial.` : ''}`,
    timestamp: new Date(),
  };

  return (
    <>
      {/* Floating Button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={toggleOpen}
              className={cn(
                'fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg transition-all duration-300',
                isOpen && 'scale-0 opacity-0'
              )}
              size="icon"
            >
              <Bot className="h-6 w-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Reports Agent</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Chat Panel */}
      <div
        className={cn(
          'fixed bottom-6 right-6 z-50 flex h-[600px] w-[400px] flex-col rounded-xl border bg-background shadow-2xl transition-all duration-300',
          isOpen ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold">Reports Agent</h3>
              {trialStatus && (
                <p className="text-xs text-muted-foreground">
                  {trialStatus.isTrialActive ? (
                    <span className="flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      {trialStatus.daysRemaining} days left
                    </span>
                  ) : trialStatus.hasCustomKey ? (
                    'Custom API Key'
                  ) : (
                    <span className="text-destructive">Trial expired</span>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={clearHistory}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear history</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowSettings(true)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Settings</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleOpen}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.length === 0 && <MessageBubble {...welcomeMessage} />}
            {messages.map((message, index) => (
              <MessageBubble key={index} {...message} />
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <form onSubmit={handleSubmit} className="border-t p-4">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your data..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={!input.trim() || isLoading}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>

      {/* Settings Dialog */}
      <AgentSettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        trialStatus={trialStatus}
        onSave={saveApiKey}
      />
    </>
  );
}
