import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Construction } from 'lucide-react';

// Coming Soon placeholder - original functionality preserved in _AttributionPageOriginal.tsx
export default function AttributionPage() {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-10 pb-10">
            <div className="flex justify-center mb-6">
              <div className="rounded-full bg-primary/10 p-4">
                <Construction className="h-12 w-12 text-primary" />
              </div>
            </div>
            <Badge variant="secondary" className="mb-4">Coming Soon</Badge>
            <h1 className="text-2xl font-bold text-foreground mb-2">Attribution</h1>
            <p className="text-muted-foreground">
              We're working on setting up the attribution system. This feature will be available soon.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
