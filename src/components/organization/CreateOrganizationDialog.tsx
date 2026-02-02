import { useState } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
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
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface CreateOrganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateOrganizationDialog({ open, onOpenChange }: CreateOrganizationDialogProps) {
  const { createOrganization, switchOrganization } = useOrganization();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleNameChange = (value: string) => {
    setName(value);
    setSlug(generateSlug(value));
  };

  const handleCreate = async () => {
    if (!name.trim() || !slug.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsCreating(true);
    const { data, error } = await createOrganization(name.trim(), slug.trim());
    setIsCreating(false);

    if (error) {
      toast.error('Failed to create organization', {
        description: error.message
      });
      return;
    }

    if (data) {
      toast.success('Organization created', {
        description: `${name} has been created successfully`
      });
      await switchOrganization(data.id);
      setName('');
      setSlug('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Organization</DialogTitle>
          <DialogDescription>
            Create a new organization for a client. They'll have their own isolated dashboard, data, and team.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name</Label>
            <Input
              id="name"
              placeholder="Acme Corp"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="slug">URL Slug</Label>
            <Input
              id="slug"
              placeholder="acme-corp"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Used in URLs and for identification
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !name.trim()}>
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Organization'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
