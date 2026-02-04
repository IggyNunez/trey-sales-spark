import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  BarChart3,
  ClipboardList,
  Settings,
  Users,
  Calendar,
  Filter,
  Download,
  MousePointerClick,
  TrendingUp,
  FileText,
  ExternalLink,
  CheckCircle2,
  Lightbulb,
  Target,
  Zap,
  ArrowRight,
  Play
} from 'lucide-react';

const sections = [
  {
    id: 'dashboard',
    title: 'Dashboard Overview',
    icon: LayoutDashboard,
    description: 'Your command center for tracking all sales calls, metrics, and team performance.',
    features: [
      {
        title: 'Key Metrics Cards',
        description: 'Top row shows Calls, Shows, Closes, and Cash collected. Click any card to see the underlying events.',
        icon: TrendingUp
      },
      {
        title: 'Events Table',
        description: 'Main table lists all booked calls with lead info, closer, source, and status. Click a lead name to see their full journey.',
        icon: Calendar
      },
      {
        title: 'Filters',
        description: 'Use the filter bar to narrow by date range, closer, traffic source, call status, or any custom field.',
        icon: Filter
      },
      {
        title: 'Overdue PCFs',
        description: 'Right sidebar shows calls that need post-call form submission. Red badges indicate priority.',
        icon: FileText
      }
    ],
    tips: [
      'Date filter defaults to "This Month" - adjust to see historical data',
      'Export any table view to CSV using the download button',
      'Hover over any metric for a tooltip explanation'
    ],
    route: '/'
  },
  {
    id: 'attribution',
    title: 'Attribution & Lead Journey',
    icon: ClipboardList,
    description: 'Track where leads come from and their complete journey through your funnel.',
    features: [
      {
        title: 'Source Badges',
        description: 'UTM (blue) = tracking link, CRM (brown) = Close/HubSpot, DETECTED (purple) = quiz funnel match.',
        icon: Target
      },
      {
        title: 'Lead Journey Sheet',
        description: 'Click any lead name to open a detailed timeline of all their interactions, calls, and payments.',
        icon: MousePointerClick
      },
      {
        title: 'Custom Fields',
        description: 'Add columns from your CRM or create custom fields to track additional lead data.',
        icon: ClipboardList
      },
      {
        title: 'UTM Health',
        description: 'Green indicator means UTM tracking is working. Red means check your tracking links.',
        icon: CheckCircle2
      }
    ],
    tips: [
      'Set up UTM links using the UTM Setup Guide in settings',
      'Quiz funnel responses are auto-detected from booking forms',
      'HubSpot/Close data syncs automatically every hour'
    ],
    route: '/attribution'
  },
  {
    id: 'analytics',
    title: 'Analytics & Performance',
    icon: BarChart3,
    description: 'Deep dive into closer performance, platform metrics, and traffic source ROI.',
    features: [
      {
        title: 'Closer Leaderboard',
        description: 'Ranked list of closers by show rate, close rate, and total cash collected.',
        icon: Users
      },
      {
        title: 'Platform Breakdown',
        description: 'See metrics by traffic source: Instagram, YouTube, Newsletter, etc. with drill-down capability.',
        icon: BarChart3
      },
      {
        title: 'Source Tree',
        description: 'Hierarchical view: Platform → Channel → Setter → Metrics. Great for attribution analysis.',
        icon: Target
      },
      {
        title: 'Time Comparisons',
        description: 'Toggle period comparison to see week-over-week or month-over-month changes.',
        icon: TrendingUp
      }
    ],
    tips: [
      'Use the drill-down tree to identify your best traffic sources',
      'Export analytics to share with your team',
      'Check analytics weekly to spot trends early'
    ],
    route: '/analytics'
  },
  {
    id: 'calls-report',
    title: 'Call Reports',
    icon: FileText,
    description: 'Detailed reporting on call outcomes, no-shows, and team performance.',
    features: [
      {
        title: 'Outcome Breakdown',
        description: 'See how many calls resulted in closes, no-shows, reschedules, or follow-ups.',
        icon: ClipboardList
      },
      {
        title: 'Source Analysis',
        description: 'Compare call quality across different traffic sources to optimize ad spend.',
        icon: Target
      },
      {
        title: 'Date Filtering',
        description: 'Filter by any date range to analyze specific campaigns or time periods.',
        icon: Calendar
      },
      {
        title: 'Export Options',
        description: 'Download detailed reports in CSV format for further analysis.',
        icon: Download
      }
    ],
    tips: [
      'Run weekly reports to track team performance',
      'Compare different time periods to measure improvement',
      'Use source analysis to cut underperforming traffic'
    ],
    route: '/calls-report'
  },
  {
    id: 'settings',
    title: 'Settings & Integrations',
    icon: Settings,
    description: 'Configure integrations, team members, and customize your dashboard.',
    features: [
      {
        title: 'Integrations',
        description: 'Connect Calendly, Cal.com, Close CRM, or HubSpot to automatically sync booking data.',
        icon: Zap
      },
      {
        title: 'Team Management',
        description: 'Invite team members, set display names, and manage closer aliases.',
        icon: Users
      },
      {
        title: 'Form Builder',
        description: 'Customize post-call form fields to capture the data you need.',
        icon: FileText
      },
      {
        title: 'Display Columns',
        description: 'Choose which columns appear in your events table and in what order.',
        icon: ClipboardList
      }
    ],
    tips: [
      'Start with integrations - connect your calendar first',
      'Set up closer display names for cleaner reporting',
      'Configure packages before your team submits PCFs'
    ],
    route: '/settings'
  }
];

const quickActions = [
  { label: 'View Dashboard', route: '/dashboard', icon: LayoutDashboard },
  { label: 'Check Analytics', route: '/analytics', icon: BarChart3 },
  { label: 'Configure Settings', route: '/settings', icon: Settings },
  { label: 'UTM Setup Guide', route: '/utm-setup', icon: Target },
];

export default function OnboardingPage() {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto py-8 px-4 space-y-10">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <Badge variant="secondary" className="px-3 py-1">
            <Play className="h-3 w-3 mr-1" />
            Getting Started Guide
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight">
            Welcome to SalesReps, Trenton! 👋
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            This guide will walk you through all the key features of your sales dashboard. 
            Follow along to master tracking, attribution, and analytics.
          </p>
        </div>

        {/* Quick Actions */}
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Quick Actions
            </CardTitle>
            <CardDescription>Jump to any section of the app</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {quickActions.map((action) => (
                <Button 
                  key={action.route}
                  variant="outline" 
                  onClick={() => navigate(action.route)}
                  className="gap-2"
                >
                  <action.icon className="h-4 w-4" />
                  {action.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Main Sections */}
        <div className="space-y-8">
          {sections.map((section, index) => (
            <Card key={section.id} className="overflow-hidden">
              <CardHeader className="bg-muted/30">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-primary/10 text-primary">
                      <section.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          Step {index + 1}
                        </Badge>
                      </div>
                      <CardTitle className="text-xl mt-1">{section.title}</CardTitle>
                      <CardDescription className="mt-1">{section.description}</CardDescription>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => navigate(section.route)}
                    className="gap-1"
                  >
                    Go <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              
              <CardContent className="pt-6 space-y-6">
                {/* Features Grid */}
                <div className="grid md:grid-cols-2 gap-4">
                  {section.features.map((feature) => (
                    <div 
                      key={feature.title}
                      className="flex gap-3 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="p-2 rounded-md bg-muted h-fit">
                        <feature.icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <h4 className="font-medium text-sm">{feature.title}</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Tips */}
                <div className="bg-accent/50 border border-accent rounded-lg p-4">
                  <div className="flex items-center gap-2 text-accent-foreground mb-2">
                    <Lightbulb className="h-4 w-4" />
                    <span className="font-medium text-sm">Pro Tips</span>
                  </div>
                  <ul className="space-y-1">
                    {section.tips.map((tip, i) => (
                      <li key={i} className="text-sm text-foreground flex items-start gap-2">
                        <CheckCircle2 className="h-3 w-3 mt-1 shrink-0 text-primary" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Badge Reference */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Badge Quick Reference</CardTitle>
            <CardDescription>Understanding the status indicators throughout the app</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <Badge variant="default">UTM</Badge>
                <span className="text-sm">Source from tracking link</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <Badge variant="secondary">CRM</Badge>
                <span className="text-sm">Source from Close/HubSpot</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <Badge variant="outline">DETECTED</Badge>
                <span className="text-sm">Quiz funnel match</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <Badge variant="default" className="bg-primary">Submitted</Badge>
                <span className="text-sm">PCF completed</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <Badge variant="secondary">Pending</Badge>
                <span className="text-sm">PCF needed</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <Badge variant="destructive">Overdue</Badge>
                <span className="text-sm">Action required</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer CTA */}
        <div className="text-center py-8 space-y-4">
          <Separator />
          <h3 className="text-xl font-semibold mt-6">Ready to get started?</h3>
          <p className="text-muted-foreground">
            Head to your dashboard to start tracking and analyzing your sales calls.
          </p>
          <Button size="lg" onClick={() => navigate('/dashboard')} className="gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Go to Dashboard
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
