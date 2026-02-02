import { AppLayout } from '@/components/layout/AppLayout';
import { DynamicFormBuilder } from '@/components/forms/DynamicFormBuilder';

export default function DynamicFormBuilderPage() {
  return (
    <AppLayout>
      <div className="max-w-4xl">
        <DynamicFormBuilder />
      </div>
    </AppLayout>
  );
}
