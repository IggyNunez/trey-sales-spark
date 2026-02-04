import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function MessageBubble({ role, content, timestamp }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          'flex max-w-[80%] flex-col gap-1 rounded-lg px-3 py-2',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        )}
      >
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {isUser ? (
            <p className="m-0 text-sm">{content}</p>
          ) : (
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="m-0 mb-2 last:mb-0 text-sm">{children}</p>,
                ul: ({ children }) => <ul className="m-0 ml-4 list-disc">{children}</ul>,
                ol: ({ children }) => <ol className="m-0 ml-4 list-decimal">{children}</ol>,
                li: ({ children }) => <li className="text-sm">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                code: ({ children }) => (
                  <code className="rounded bg-background/50 px-1 py-0.5 text-xs">{children}</code>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          )}
        </div>
        <span
          className={cn(
            'text-xs',
            isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
        >
          {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}
