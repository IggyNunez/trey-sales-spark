import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Plus, 
  Share2, 
  RefreshCw, 
  Grip,
  Settings,
  Eye,
  EyeOff,
  GripVertical,
  ChevronDown,
  ChevronUp,
  X,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  WebhookDashboard, 
  useDashboardWidgets, 
  useDeleteDashboardWidget,
  useUpdateDashboardWidget,
  useDatasetFields,
  useDatasetRecords,
  DashboardWidget,
} from '@/hooks/useWebhookDashboard';
import { WidgetBuilder } from './WidgetBuilder';
import { WidgetRenderer } from './WidgetRenderer';
import { useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@/hooks/useOrganization';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GlobalFilter {
  field: string;
  op: string;
  value: any;
}

interface EnhancedDashboardViewerProps {
  dashboard: WebhookDashboard;
  showBackButton?: boolean;
  onBack?: () => void;
}

export function EnhancedDashboardViewer({ dashboard, showBackButton = true, onBack }: EnhancedDashboardViewerProps) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();
  
  const { data: widgets, isLoading, refetch } = useDashboardWidgets(dashboard.id);
  const deleteWidget = useDeleteDashboardWidget();
  const updateWidget = useUpdateDashboardWidget();
  
  const [isWidgetBuilderOpen, setIsWidgetBuilderOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Global filters state
  const [globalFilters, setGlobalFilters] = useState<GlobalFilter[]>([]);
  const [selectedTeamMember, setSelectedTeamMember] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  
  // Get the first widget's dataset to fetch fields and unique values
  const firstDatasetId = widgets?.[0]?.dataset_id;
  const { data: datasetFields } = useDatasetFields(firstDatasetId);
  const { data: records } = useDatasetRecords(firstDatasetId, 1000);
  
  // Extract unique team members from records (check entity_name, closer_name, setter_name, team_member fields)
  const uniqueTeamMembers = useMemo(() => {
    if (!records) return [];
    const members = new Set<string>();
    records.forEach(r => {
      // Check entity_name first (used by dynamic forms), then closer_name, setter_name, team_member
      const member = r.extracted_data?.entity_name || r.extracted_data?.closer_name || r.extracted_data?.setter_name || r.extracted_data?.team_member;
      if (member && typeof member === 'string') {
        members.add(member);
      }
    });
    return Array.from(members).sort();
  }, [records]);
  
  // Determine which field is used for team member filtering based on available data
  const teamMemberField = useMemo(() => {
    if (!records?.length) return 'entity_name';
    const sample = records[0]?.extracted_data;
    if (sample?.entity_name) return 'entity_name';
    if (sample?.closer_name) return 'closer_name';
    if (sample?.setter_name) return 'setter_name';
    if (sample?.team_member) return 'team_member';
    return 'entity_name';
  }, [records]);
  
  // Build global filters array from UI state
  const activeGlobalFilters = useMemo(() => {
    const filters: GlobalFilter[] = [];
    
    if (selectedTeamMember && selectedTeamMember !== 'all') {
      // Filter by the detected team member field (entity_name, closer_name, or team_member)
      filters.push({ field: teamMemberField, op: '=', value: selectedTeamMember });
    }
    
    if (dateFrom) {
      filters.push({ field: 'date', op: '>=', value: format(dateFrom, 'yyyy-MM-dd') });
    }
    
    if (dateTo) {
      filters.push({ field: 'date', op: '<=', value: format(dateTo, 'yyyy-MM-dd') });
    }
    
    return filters;
  }, [selectedTeamMember, dateFrom, dateTo, teamMemberField]);
  
  const hasActiveFilters = selectedTeamMember !== 'all' || dateFrom || dateTo;
  
  const clearAllFilters = () => {
    setSelectedTeamMember('all');
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  // Separate visible and hidden widgets
  const { visibleWidgets, hiddenWidgets } = useMemo(() => {
    if (!widgets) return { visibleWidgets: [], hiddenWidgets: [] };
    
    const visible = widgets.filter(w => w.is_active !== false);
    const hidden = widgets.filter(w => w.is_active === false);
    
    // Sort by position
    visible.sort((a, b) => {
      const aPos = a.position?.y ?? 0;
      const bPos = b.position?.y ?? 0;
      return aPos - bPos;
    });
    
    return { visibleWidgets: visible, hiddenWidgets: hidden };
  }, [widgets]);

  // Calculate next widget position
  const nextPosition = useMemo(() => {
    if (!widgets?.length) return { x: 0, y: 0 };
    const positions = widgets.map(w => ({
      x: w.position.x,
      y: w.position.y,
      w: w.position.w,
      h: w.position.h,
    }));
    const maxY = Math.max(...positions.map(p => p.y + p.h), 0);
    return { x: 0, y: maxY };
  }, [widgets]);

  const handleRefreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['dataset-records'] });
    refetch();
    toast.success('Dashboard refreshed');
  };

  const handleDeleteWidget = async (widgetId: string) => {
    if (!confirm('Are you sure you want to delete this widget?')) return;
    
    try {
      await deleteWidget.mutateAsync({ id: widgetId, dashboardId: dashboard.id });
      toast.success('Widget deleted');
    } catch (error) {
      toast.error('Failed to delete widget');
    }
  };

  const handleToggleWidgetVisibility = async (widget: DashboardWidget) => {
    try {
      await updateWidget.mutateAsync({
        id: widget.id,
        dashboardId: dashboard.id,
        is_active: !widget.is_active,
      });
      toast.success(widget.is_active ? 'Widget hidden' : 'Widget shown');
    } catch (error) {
      toast.error('Failed to update widget');
    }
  };

  const handleMoveWidget = async (widget: DashboardWidget, direction: 'up' | 'down') => {
    const currentIndex = visibleWidgets.findIndex(w => w.id === widget.id);
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (newIndex < 0 || newIndex >= visibleWidgets.length) return;
    
    const targetWidget = visibleWidgets[newIndex];
    
    // Assign new sequential y positions based on new order
    const currentY = currentIndex;
    const targetY = newIndex;
    
    try {
      // Swap positions
      await Promise.all([
        updateWidget.mutateAsync({
          id: widget.id,
          dashboardId: dashboard.id,
          position: { ...widget.position, y: targetY },
        }),
        updateWidget.mutateAsync({
          id: targetWidget.id,
          dashboardId: dashboard.id,
          position: { ...targetWidget.position, y: currentY },
        }),
      ]);
      // Refetch to update the list order
      await refetch();
      toast.success('Widget reordered');
    } catch (error) {
      toast.error('Failed to reorder widget');
    }
  };

  const handleEditWidget = (widget: DashboardWidget) => {
    setEditingWidget(widget);
    setIsWidgetBuilderOpen(true);
  };

  const handleCloseWidgetBuilder = () => {
    setIsWidgetBuilderOpen(false);
    setEditingWidget(null);
  };

  const copyShareLink = () => {
    if (dashboard.share_token) {
      const url = `${window.location.origin}/shared-dashboard/${dashboard.share_token}`;
      navigator.clipboard.writeText(url);
      toast.success('Share link copied to clipboard');
    }
  };

  const renderWidgets = () => {
    if (isLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      );
    }

    if (!visibleWidgets.length) {
      return (
        <div className="border-2 border-dashed rounded-lg p-12 text-center">
          <Grip className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No widgets yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add widgets to visualize your data
          </p>
          <Button onClick={() => setIsWidgetBuilderOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Widget
          </Button>
        </div>
      );
    }

    // Determine column span based on widget width configuration
    const getColSpan = (widget: DashboardWidget) => {
      const w = widget.position.w || 3;
      if (w >= 12) return 'span 4 / span 4'; // Full width (w=12)
      if (w >= 6) return 'span 2 / span 2';  // Half width (w=6)
      return 'span 1 / span 1';               // Third width (w=3 or less)
    };

    const handleResizeWidget = async (widget: DashboardWidget, size: 'full' | 'half' | 'third') => {
      const widthMap = { full: 12, half: 6, third: 3 };
      try {
        await updateWidget.mutateAsync({
          id: widget.id,
          dashboardId: dashboard.id,
          position: { ...widget.position, w: widthMap[size] },
        });
        toast.success(`Widget resized to ${size} width`);
      } catch (error) {
        toast.error('Failed to resize widget');
      }
    };

    const handleResizeHeightWidget = async (widget: DashboardWidget, height: 'small' | 'medium' | 'large') => {
      const heightMap = { small: 2, medium: 4, large: 6 };
      try {
        await updateWidget.mutateAsync({
          id: widget.id,
          dashboardId: dashboard.id,
          position: { ...widget.position, h: heightMap[height] },
        });
        toast.success(`Widget height set to ${height}`);
      } catch (error) {
        toast.error('Failed to resize widget height');
      }
    };

    // Get min-height based on widget height setting
    const getMinHeight = (widget: DashboardWidget) => {
      const h = widget.position?.h || 2;
      if (h >= 6) return '400px'; // Large
      if (h >= 4) return '300px'; // Medium
      return '200px'; // Small
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {visibleWidgets.map((widget, index) => {
          const colSpan = getColSpan(widget);
          const minHeight = getMinHeight(widget);
          return (
            <div 
              key={widget.id}
              style={{
                gridColumn: colSpan,
                minHeight: minHeight,
              }}
            >
              <WidgetRenderer
                widget={widget}
                onEdit={() => handleEditWidget(widget)}
                onDelete={() => handleDeleteWidget(widget.id)}
                onMoveUp={() => handleMoveWidget(widget, 'up')}
                onMoveDown={() => handleMoveWidget(widget, 'down')}
                onResize={(size) => handleResizeWidget(widget, size)}
                onResizeHeight={(height) => handleResizeHeightWidget(widget, height)}
                canMoveUp={index > 0}
                canMoveDown={index < visibleWidgets.length - 1}
                globalFilters={activeGlobalFilters}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-xl font-semibold">{dashboard.name}</h2>
            {dashboard.description && (
              <p className="text-sm text-muted-foreground">{dashboard.description}</p>
            )}
          </div>
          {dashboard.is_shared && (
            <Badge variant="secondary" className="cursor-pointer" onClick={copyShareLink}>
              <Share2 className="h-3 w-3 mr-1" />
              Shared
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefreshAll}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setIsWidgetBuilderOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Widget
          </Button>
        </div>
      </div>

      {/* Global Filters Bar */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/50 rounded-lg border">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filters:
        </div>
        
        {/* Team Member Filter */}
        <Select value={selectedTeamMember} onValueChange={setSelectedTeamMember}>
          <SelectTrigger className="w-[180px] bg-background">
            <SelectValue placeholder="All Team Members" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Team Members</SelectItem>
            {uniqueTeamMembers.map((member) => (
              <SelectItem key={member} value={member}>
                {member}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Date From Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "w-[140px] justify-start text-left font-normal",
                !dateFrom && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateFrom ? format(dateFrom, 'MMM dd') : 'From'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateFrom}
              onSelect={setDateFrom}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        
        {/* Date To Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "w-[140px] justify-start text-left font-normal",
                !dateTo && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateTo ? format(dateTo, 'MMM dd') : 'To'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateTo}
              onSelect={setDateTo}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        
        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-muted-foreground">
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
        
        {/* Active filter badges */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1 ml-2">
            {selectedTeamMember !== 'all' && (
              <Badge variant="secondary" className="text-xs">
                {selectedTeamMember}
              </Badge>
            )}
            {dateFrom && (
              <Badge variant="secondary" className="text-xs">
                From: {format(dateFrom, 'MMM dd')}
              </Badge>
            )}
            {dateTo && (
              <Badge variant="secondary" className="text-xs">
                To: {format(dateTo, 'MMM dd')}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Manage Widgets Sheet */}
      <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <SheetTrigger asChild>
          <div className="flex justify-end">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Manage Widgets
            </Button>
          </div>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Manage Widgets</SheetTitle>
            <SheetDescription>
              Show, hide, reorder, or delete widgets from your dashboard
            </SheetDescription>
          </SheetHeader>
          
          <div className="mt-6 space-y-4">
            {/* Visible Widgets */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Visible Widgets ({visibleWidgets.length})
              </Label>
              <div className="space-y-2">
                {visibleWidgets.map((widget, index) => (
                  <div 
                    key={widget.id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-background"
                  >
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{widget.title || widget.widget_type}</span>
                      <Badge variant="outline" className="text-xs">
                        {widget.widget_type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={index === 0}
                        onClick={() => handleMoveWidget(widget, 'up')}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={index === visibleWidgets.length - 1}
                        onClick={() => handleMoveWidget(widget, 'down')}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Switch
                        checked={widget.is_active !== false}
                        onCheckedChange={() => handleToggleWidgetVisibility(widget)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeleteWidget(widget.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
                {visibleWidgets.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No visible widgets
                  </p>
                )}
              </div>
            </div>

            {/* Hidden Widgets */}
            {hiddenWidgets.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-start gap-2">
                    <EyeOff className="h-4 w-4" />
                    Hidden Widgets ({hiddenWidgets.length})
                    <ChevronDown className="h-4 w-4 ml-auto" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  {hiddenWidgets.map((widget) => (
                    <div 
                      key={widget.id}
                      className="flex items-center justify-between p-3 border rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-muted-foreground">
                          {widget.title || widget.widget_type}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {widget.widget_type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleWidgetVisibility(widget)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Show
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteWidget(widget.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Widgets Grid */}
      {renderWidgets()}

      {/* Widget Builder Dialog */}
      <WidgetBuilder
        dashboardId={dashboard.id}
        isOpen={isWidgetBuilderOpen}
        onClose={handleCloseWidgetBuilder}
        editingWidget={editingWidget}
        nextPosition={nextPosition}
      />
    </div>
  );
}
