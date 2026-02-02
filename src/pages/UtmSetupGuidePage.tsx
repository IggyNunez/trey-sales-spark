import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Copy, CheckCircle2, Link2, Settings, Lightbulb, AlertTriangle, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="relative group">
      <pre className="bg-muted/50 border rounded-lg p-4 overflow-x-auto text-sm font-mono whitespace-pre-wrap break-all">
        <code>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        {copied ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export default function UtmSetupGuidePage() {
  return (
    <AppLayout>
      <div className="container max-w-4xl py-8 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Link2 className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">UTM Parameter Setup Guide</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Track where your leads come from by adding UTM parameters to your Cal.com booking links.
          </p>
        </div>

        <Separator />

        {/* Why UTM Parameters Matter */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Why UTM Parameters Matter
            </CardTitle>
            <CardDescription>Unlock powerful marketing insights</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <h4 className="font-semibold">📊 Track Lead Sources</h4>
                <p className="text-sm text-muted-foreground">
                  Know exactly which platforms (Instagram, YouTube, TikTok, etc.) are driving your bookings.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold">👥 Measure Setter Performance</h4>
                <p className="text-sm text-muted-foreground">
                  Attribute bookings to specific setters and track their show rates and close rates.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold">💰 Optimize Marketing Spend</h4>
                <p className="text-sm text-muted-foreground">
                  Identify your highest-converting traffic sources and double down on what works.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Start */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Quick Start Guide
            </CardTitle>
            <CardDescription>Get UTM tracking running in 3 simple steps</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4">
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                  1
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold">Copy Your Cal.com Booking Link</h4>
                  <p className="text-sm text-muted-foreground">
                    Start with your standard booking link, e.g., <code className="bg-muted px-1 rounded">https://cal.com/your-team/sales-call</code>
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                  2
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold">Add UTM Parameters</h4>
                  <p className="text-sm text-muted-foreground">
                    Append <code className="bg-muted px-1 rounded">?</code> followed by your parameters, separated by <code className="bg-muted px-1 rounded">&</code>
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                  3
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold">Share the New Link</h4>
                  <p className="text-sm text-muted-foreground">
                    Use this enhanced link in your bio, posts, or DMs. Data will automatically sync to your dashboard.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Parameter Reference */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Parameter Reference
            </CardTitle>
            <CardDescription>Supported UTM parameters and their purpose</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 rounded-lg p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-semibold">Parameter</th>
                    <th className="text-left py-2 font-semibold">Purpose</th>
                    <th className="text-left py-2 font-semibold">Example</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  <tr className="border-b">
                    <td className="py-3 text-primary font-semibold">utm_platform</td>
                    <td className="py-3 font-sans text-muted-foreground">Traffic source (Instagram, YouTube, etc.)</td>
                    <td className="py-3">utm_platform=instagram</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-3 text-primary font-semibold">utm_setter</td>
                    <td className="py-3 font-sans text-muted-foreground">Who generated the lead</td>
                    <td className="py-3">utm_setter=john_smith</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-3 text-primary font-semibold">utm_campaign</td>
                    <td className="py-3 font-sans text-muted-foreground">Marketing campaign name</td>
                    <td className="py-3">utm_campaign=summer_promo</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-3 text-primary font-semibold">utm_source</td>
                    <td className="py-3 font-sans text-muted-foreground">Alternative to utm_platform</td>
                    <td className="py-3">utm_source=facebook</td>
                  </tr>
                  <tr>
                    <td className="py-3 text-primary font-semibold">utm_medium</td>
                    <td className="py-3 font-sans text-muted-foreground">Marketing medium (social, email, etc.)</td>
                    <td className="py-3">utm_medium=social</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Examples */}
        <Card>
          <CardHeader>
            <CardTitle>Examples</CardTitle>
            <CardDescription>Real booking link examples with UTM parameters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Basic Example (Platform Only)</h4>
              <CodeBlock code="https://cal.com/your-team/sales-call?utm_platform=instagram" />
            </div>
            
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">With Setter Attribution</h4>
              <CodeBlock code="https://cal.com/your-team/sales-call?utm_platform=instagram&utm_setter=john_smith" />
            </div>
            
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Full Campaign Tracking</h4>
              <CodeBlock code="https://cal.com/your-team/sales-call?utm_platform=youtube&utm_setter=sarah_jones&utm_campaign=q1_launch" />
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Setter Link for DMs</h4>
              <CodeBlock code="https://cal.com/your-team/discovery?utm_setter=mike_wilson&utm_source=instagram_dms" />
            </div>
          </CardContent>
        </Card>

        {/* Troubleshooting */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Troubleshooting
            </CardTitle>
            <CardDescription>Common issues and solutions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="border-l-4 border-amber-500 pl-4 py-2">
                <h4 className="font-semibold">UTM data not showing up?</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Make sure you're using <code className="bg-muted px-1 rounded">?</code> before the first parameter 
                  and <code className="bg-muted px-1 rounded">&</code> between each parameter. Check for typos in parameter names.
                </p>
              </div>
              
              <div className="border-l-4 border-amber-500 pl-4 py-2">
                <h4 className="font-semibold">Setter name not appearing in dashboard?</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Use underscores instead of spaces in setter names (e.g., <code className="bg-muted px-1 rounded">john_smith</code> not <code className="bg-muted px-1 rounded">john smith</code>).
                </p>
              </div>
              
              <div className="border-l-4 border-amber-500 pl-4 py-2">
                <h4 className="font-semibold">Historical data missing UTM parameters?</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Go to Settings → Integrations → Cal.com and click "Re-sync UTM Data" to backfill UTM parameters from historical bookings.
                </p>
              </div>

              <div className="border-l-4 border-amber-500 pl-4 py-2">
                <h4 className="font-semibold">Different platforms showing as separate sources?</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Use consistent naming. The system normalizes common variations (e.g., "IG", "ig", "Instagram" all become "Instagram"), 
                  but unique spellings will appear as separate sources.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
