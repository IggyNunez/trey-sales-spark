import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CURRENT_NOTIFICATION, dismissNotification } from '@/config/notifications';
import { 
  MousePointerClick, 
  BarChart3, 
  TrendingUp, 
  DollarSign,
  CheckCircle2,
  Sparkles,
  Calendar,
  Filter,
  Columns,
  Download,
  UserPlus,
  Webhook,
  Trash2
} from 'lucide-react';

const iconMap: Record<string, React.ElementType> = {
  MousePointerClick,
  BarChart3,
  TrendingUp,
  DollarSign,
  Calendar,
  Filter,
  Columns,
  Download,
  UserPlus,
  Webhook,
  Trash2,
};

export default function WhatsNewPage() {
  const navigate = useNavigate();

  const handleGotIt = () => {
    dismissNotification(CURRENT_NOTIFICATION.id);
    navigate('/');
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            Version {CURRENT_NOTIFICATION.version} · {CURRENT_NOTIFICATION.date}
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-3">
            {CURRENT_NOTIFICATION.title}
          </h1>
          <p className="text-muted-foreground text-lg">
            Here's what's new in SalesReps
          </p>
        </div>

        {/* Features */}
        <div className="space-y-4 mb-10">
          {CURRENT_NOTIFICATION.features.map((feature, index) => {
            const Icon = iconMap[feature.icon] || BarChart3;
            return (
              <Card key={index} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-lg">{feature.title}</CardTitle>
                      <CardDescription className="mt-1.5 text-sm leading-relaxed">
                        {feature.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button onClick={handleGotIt} size="lg" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Got it, take me to dashboard
          </Button>
          <Button 
            variant="outline" 
            size="lg"
            onClick={() => navigate('/analytics')}
          >
            Try Analytics Now
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
