import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  BarChart3, 
  Users, 
  TrendingUp, 
  Shield, 
  Zap,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Play,
  Clock,
  DollarSign,
  Target,
  Repeat,
  PieChart,
  Award,
  MessageSquare,
  ChevronRight,
  Phone,
  FileText,
  RefreshCw,
  ChevronDown,
  Calendar
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const Index = () => {
  const features = [
    {
      icon: BarChart3,
      title: 'Crystal-Clear Analytics',
      description: 'Every metric you need in one dashboard. Close rate, show rate, revenue, attribution—updated in real-time.',
      details: ['Live metric updates', 'Custom date ranges', 'Drill-down reports', 'Export to CSV'],
    },
    {
      icon: Users,
      title: 'Complete Team Visibility',
      description: 'See exactly how every closer and setter performs. Individual scorecards, leaderboards, and trend analysis.',
      details: ['Individual scorecards', 'Team leaderboards', 'Role-based access', 'Performance trends'],
    },
    {
      icon: Zap,
      title: 'Plug Into Any Stack',
      description: 'Connect your scheduler, CRM, and payment processor. We integrate with the tools you already use.',
      details: ['Any scheduling tool', 'Any CRM system', 'Any payment processor', 'Webhook support'],
    },
    {
      icon: TrendingUp,
      title: 'End-to-End Attribution',
      description: 'Track every deal from first touch to cash collected. Know exactly which sources and setters drive revenue.',
      details: ['Setter attribution', 'Traffic source ROI', 'Campaign tracking', 'Revenue by source'],
    },
    {
      icon: FileText,
      title: 'Effortless Post-Call Forms',
      description: 'Reps submit PCFs in 30 seconds with auto-populated data. No more chasing people for call outcomes.',
      details: ['Auto-fill lead data', 'Custom outcomes', 'Payment logging', 'Notes & follow-ups'],
    },
    {
      icon: RefreshCw,
      title: 'Smart Automation',
      description: 'Auto-detect reschedules and cancellations. Your data stays clean without manual updates.',
      details: ['Auto-reschedule logic', 'Cancel detection', 'Status automation', 'Data cleanup'],
    },
  ];

  const howItWorks = [
    {
      step: '01',
      title: 'Connect Your Tools',
      description: 'Link your scheduler, CRM, and payment processor. Works with any tools you already use.',
      icon: Zap,
    },
    {
      step: '02',
      title: 'Data Syncs Automatically',
      description: 'Every booking, reschedule, cancellation, and payment flows into your dashboard in real-time.',
      icon: Calendar,
    },
    {
      step: '03',
      title: 'Reps Submit PCFs',
      description: 'After each call, reps complete a simple form. Outcome, payment, and notes—all captured in seconds.',
      icon: FileText,
    },
    {
      step: '04',
      title: 'Make Smarter Decisions',
      description: 'See exactly what\'s working. Double down on top performers and fix what\'s broken.',
      icon: TrendingUp,
    },
  ];

  const useCases = [
    {
      title: 'High-Ticket Sales Teams',
      description: 'Track every deal with precision. Know your close rate, average deal size, and cash collected—always up to date.',
      icon: DollarSign,
      metrics: ['Close rate tracking', 'Revenue attribution', 'Show rate analysis'],
    },
    {
      title: 'Appointment Setting Agencies',
      description: 'Prove ROI to clients with detailed setter attribution. Show exactly which setters drive shows and closes.',
      icon: Phone,
      metrics: ['Setter leaderboards', 'Client dashboards', 'Attribution reports'],
    },
    {
      title: 'Coaching & Course Creators',
      description: 'Scale your enrollment team with data. Track which closers convert the most applications into students.',
      icon: Award,
      metrics: ['Enrollment tracking', 'Closer performance', 'Revenue by offer'],
    },
  ];

  const faqs = [
    {
      question: "How long does setup take?",
      answer: "Most teams are fully set up in under 30 minutes. Connect your tools, invite your team, and you're ready to go. We handle all the technical integration work behind the scenes.",
    },
    {
      question: "What tools do you integrate with?",
      answer: "SalesReps works with any scheduling tool, CRM, or payment processor. We have native integrations for popular tools and webhook support for everything else. If you can send data, we can track it.",
    },
    {
      question: "Can I white-label this for my clients?",
      answer: "Yes! Our white-label program lets agencies and team leaders offer SalesReps under their own brand. Your clients get their own login, dashboard, and data—completely separate from yours.",
    },
    {
      question: "How does the reschedule detection work?",
      answer: "When a lead books a new call of the same type, we automatically mark the previous booking as rescheduled. This keeps your show rate and cancel rate accurate without manual data entry.",
    },
    {
      question: "What metrics can I track?",
      answer: "Everything that matters: close rate, show rate, cancel rate, reschedule rate, cash collected, average deal size, calls scheduled, offers made, setter attribution, source attribution, and more. Plus, you can customize which metrics appear on your dashboard.",
    },
    {
      question: "Is my data secure?",
      answer: "Absolutely. We use enterprise-grade encryption, secure authentication, and role-based access controls. Your sales data stays private and protected.",
    },
  ];

  const benefits = [
    { icon: Clock, text: 'Save 10+ hours/week on manual tracking' },
    { icon: Target, text: 'Identify top performers instantly' },
    { icon: DollarSign, text: 'Track every dollar from source to close' },
    { icon: PieChart, text: 'Make data-driven decisions' },
    { icon: Repeat, text: 'Auto-detect reschedules & cancels' },
    { icon: Shield, text: 'Works with your existing tools' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">SalesReps</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
              <a href="#use-cases" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Use Cases</a>
              <a href="#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/auth">
                <Button variant="ghost">Log In</Button>
              </Link>
              <Link to="/auth">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Zap className="h-4 w-4" />
              The #1 Sales Tracking Platform for High-Ticket Teams
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight">
              Stop Guessing Your Numbers.{' '}
              <span className="text-primary">Start Scaling.</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
              Real-time analytics for close rate, show rate, revenue, and attribution. 
              Know exactly what's working—and what's not—so you can scale with confidence.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Link to="/auth">
                <Button size="lg" className="w-full sm:w-auto gap-2 h-12 px-8">
                  Start Free Trial <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="w-full sm:w-auto gap-2 h-12 px-8">
                <Play className="h-4 w-4" /> Watch Demo
              </Button>
            </div>
          </div>
        </div>
        
        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="h-6 w-6 text-muted-foreground" />
        </div>
      </section>

      {/* Problem/Solution Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16">
            <div className="flex flex-col">
              <h2 className="text-3xl font-bold mb-8">
                You're Flying Blind
              </h2>
              <div className="space-y-5 flex-1">
                <div className="flex items-center gap-4">
                  <XCircle className="h-6 w-6 text-destructive flex-shrink-0" />
                  <p className="text-muted-foreground">Spreadsheets that are always out of date</p>
                </div>
                <div className="flex items-center gap-4">
                  <XCircle className="h-6 w-6 text-destructive flex-shrink-0" />
                  <p className="text-muted-foreground">No idea which setters actually drive revenue</p>
                </div>
                <div className="flex items-center gap-4">
                  <XCircle className="h-6 w-6 text-destructive flex-shrink-0" />
                  <p className="text-muted-foreground">Chasing reps to fill out post-call forms</p>
                </div>
                <div className="flex items-center gap-4">
                  <XCircle className="h-6 w-6 text-destructive flex-shrink-0" />
                  <p className="text-muted-foreground">Guessing your real close rate and show rate</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col">
              <h2 className="text-3xl font-bold mb-8 text-primary">
                SalesReps Gives You Clarity
              </h2>
              <div className="space-y-5 flex-1">
                <div className="flex items-center gap-4">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0" />
                  <p>One dashboard with every metric that matters</p>
                </div>
                <div className="flex items-center gap-4">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0" />
                  <p>Full attribution from lead source to cash collected</p>
                </div>
                <div className="flex items-center gap-4">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0" />
                  <p>30-second PCFs that reps actually complete</p>
                </div>
                <div className="flex items-center gap-4">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0" />
                  <p>Accurate, real-time data you can trust</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 scroll-mt-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-primary font-semibold mb-2">FEATURES</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Everything You Need to Scale</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              From booking to close to cash collected—track every touchpoint in your sales process.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="border-0 shadow-sm hover:shadow-lg transition-all duration-300 group">
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground mb-4">{feature.description}</p>
                  <ul className="space-y-2">
                    {feature.details.map((detail, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <ChevronRight className="h-4 w-4 text-primary" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 bg-muted/30 scroll-mt-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-primary font-semibold mb-2">HOW IT WORKS</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Up and Running in Minutes</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              No complex setup. No technical expertise required. Just connect and go.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {howItWorks.map((step, index) => (
              <div key={index} className="relative">
                <div className="text-6xl font-bold text-primary/10 mb-4">{step.step}</div>
                <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center mb-4">
                  <step.icon className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
                {index < howItWorks.length - 1 && (
                  <div className="hidden lg:block absolute top-24 left-full w-full h-0.5 bg-gradient-to-r from-primary/20 to-transparent -translate-x-8" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-primary font-semibold mb-2">WHY SALESREPS</p>
              <h2 className="text-3xl sm:text-4xl font-bold mb-6">
                Built for Teams That Want to Win
              </h2>
              <p className="text-muted-foreground mb-8 text-lg">
                Stop juggling spreadsheets and disconnected tools. Get a single source of truth 
                for all your sales data, with the flexibility to customize everything for your workflow.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <benefit.icon className="h-5 w-5 text-primary flex-shrink-0" />
                    <span className="text-sm">{benefit.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gradient-to-br from-primary/20 to-primary/5 rounded-2xl p-8 lg:p-12">
              <div className="bg-background rounded-xl shadow-xl p-6 space-y-6">
                <div className="flex items-center justify-between pb-4 border-b">
                  <span className="font-semibold">This Week's Performance</span>
                  <span className="text-xs text-muted-foreground">Live</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Close Rate</span>
                  <span className="text-2xl font-bold text-primary">32.5%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full w-1/3 bg-primary rounded-full" />
                </div>
                <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-xl font-bold">$47.2K</p>
                    <p className="text-xs text-muted-foreground">Cash Collected</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold">89%</p>
                    <p className="text-xs text-muted-foreground">Show Rate</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold">24</p>
                    <p className="text-xs text-muted-foreground">Calls Taken</p>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-3">Top Closers</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>🥇 Marcus C.</span>
                      <span className="text-primary font-medium">45% close rate</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>🥈 Sarah W.</span>
                      <span className="text-muted-foreground">38% close rate</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>🥉 David P.</span>
                      <span className="text-muted-foreground">31% close rate</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section id="use-cases" className="py-20 bg-muted/30 scroll-mt-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-primary font-semibold mb-2">USE CASES</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Built for Your Business</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Whether you're running a sales team, agency, or coaching business—SalesReps adapts to you.
            </p>
          </div>
          <div className="grid lg:grid-cols-3 gap-8">
            {useCases.map((useCase, index) => (
              <Card key={index} className="border-0 shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  <div className="bg-primary/5 p-6">
                    <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center mb-4">
                      <useCase.icon className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">{useCase.title}</h3>
                    <p className="text-muted-foreground">{useCase.description}</p>
                  </div>
                  <div className="p-6 bg-background">
                    <p className="text-sm font-medium mb-3">Key Metrics:</p>
                    <div className="flex flex-wrap gap-2">
                      {useCase.metrics.map((metric, i) => (
                        <span key={i} className="px-3 py-1 bg-primary/10 text-primary text-sm rounded-full">
                          {metric}
                        </span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>


      {/* White Label Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
                  <Shield className="h-4 w-4" />
                  White-Label Solution
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                  Your Brand, Your Platform
                </h2>
                <p className="text-muted-foreground mb-6 text-lg">
                  Agencies and team leaders can white-label SalesReps for their own clients. 
                  Give your team a branded experience while keeping all the powerful features.
                </p>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                    <span>Custom branding and domain</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                    <span>Separate client workspaces</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                    <span>Client-specific reporting</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                    <span>Priority support</span>
                  </li>
                </ul>
                <Link to="/auth">
                  <Button size="lg" className="gap-2">
                    Apply for White-Label <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
              <div className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl p-8 text-primary-foreground">
                <h3 className="text-2xl font-bold mb-4">Perfect for:</h3>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <span>Sales agencies managing multiple clients</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <span>Coaching companies with enrollment teams</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <span>Appointment setting businesses</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <span>Anyone who wants their own branded sales platform</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 scroll-mt-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-primary font-semibold mb-2">FAQ</p>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Common Questions</h2>
            </div>
            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`} className="border rounded-lg px-6">
                  <AccordionTrigger className="text-left hover:no-underline py-4">
                    <span className="font-semibold">{faq.question}</span>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-primary rounded-3xl p-8 sm:p-12 lg:p-16 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-primary-foreground mb-4">
                Ready to See Your Real Numbers?
              </h2>
              <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto text-lg">
                Join hundreds of sales teams already using SalesReps to track, measure, 
                and improve their performance.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/auth">
                  <Button size="lg" variant="secondary" className="gap-2 h-12 px-8">
                    Start Free Trial <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="gap-2 h-12 px-8 bg-transparent border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10">
                  <MessageSquare className="h-4 w-4" /> Talk to Sales
                </Button>
              </div>
              <p className="text-primary-foreground/60 text-sm mt-6">
                No credit card required • Free 14-day trial • Cancel anytime
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="font-bold">SalesReps</span>
              </div>
              <p className="text-sm text-muted-foreground">
                The complete sales tracking platform for high-ticket teams.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#use-cases" className="hover:text-foreground transition-colors">Use Cases</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Integrations</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">About</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} SalesReps. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                <span className="sr-only">Twitter</span>
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" /></svg>
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                <span className="sr-only">LinkedIn</span>
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
