import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, CheckCircle2, XCircle, AlertCircle, Zap, Database, Settings, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "yrlbwzxphjtnivjbpzsq";
const WEBHOOK_BASE_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/generic-webhook`;

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="relative group">
      <pre className="bg-muted/50 border rounded-lg p-4 overflow-x-auto text-sm font-mono">
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

function ResponseBlock({ status, statusText, body }: { status: number; statusText: string; body: string }) {
  const isSuccess = status >= 200 && status < 300;
  const isError = status >= 400;
  
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {isSuccess && <CheckCircle2 className="h-4 w-4 text-primary" />}
        {isError && <XCircle className="h-4 w-4 text-destructive" />}
        <Badge variant={isSuccess ? "default" : "destructive"}>
          {status} {statusText}
        </Badge>
      </div>
      <CodeBlock code={body} language="json" />
    </div>
  );
}

export default function WebhookDocsPage() {
  return (
    <AppLayout>
      <div className="container max-w-5xl py-8 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Webhook Dashboard API</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Ingest data from any external service via webhooks, transform payloads with JSON path mappings, 
            and build real-time dashboards.
          </p>
        </div>

        <Separator />

        {/* Quick Start */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Quick Start Guide
            </CardTitle>
            <CardDescription>Get your webhook ingestion running in 3 steps</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4">
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                  1
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold">Create a Dataset</h4>
                  <p className="text-sm text-muted-foreground">
                    Go to Settings → Webhook Dashboard → Datasets tab. Create a dataset and define your field mappings 
                    using JSON paths (e.g., <code className="bg-muted px-1 rounded">data.customer.email</code>).
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                  2
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold">Create a Webhook Connection</h4>
                  <p className="text-sm text-muted-foreground">
                    Go to the Connections tab. Create a connection, select your dataset, and copy the generated endpoint URL.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                  3
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold">Send Webhooks</h4>
                  <p className="text-sm text-muted-foreground">
                    Configure your external service (Stripe, n8n, Zapier, etc.) to POST JSON payloads to your endpoint URL.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Reference */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              API Reference
            </CardTitle>
            <CardDescription>Complete endpoint documentation with examples</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="basic">Basic Request</TabsTrigger>
                <TabsTrigger value="stripe">Stripe</TabsTrigger>
                <TabsTrigger value="n8n">n8n</TabsTrigger>
                <TabsTrigger value="zapier">Zapier</TabsTrigger>
              </TabsList>
              
              <TabsContent value="basic" className="space-y-6 mt-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Endpoint</h4>
                    <CodeBlock code={`POST ${WEBHOOK_BASE_URL}?connection_id=YOUR_CONNECTION_UUID`} />
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Headers</h4>
                    <CodeBlock code={`Content-Type: application/json`} />
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Basic cURL Example</h4>
                    <CodeBlock code={`curl -X POST "${WEBHOOK_BASE_URL}?connection_id=YOUR_CONNECTION_UUID" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event": "test.created",
    "data": {
      "id": "evt_123",
      "customer": {
        "email": "john@example.com",
        "name": "John Doe"
      },
      "amount": 9999,
      "currency": "usd",
      "created_at": "2026-01-23T12:00:00Z"
    }
  }'`} />
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-semibold mb-2">Success Response</h4>
                    <ResponseBlock 
                      status={200} 
                      statusText="OK" 
                      body={`{
  "success": true,
  "record_id": "79882f03-4f2c-4e4e-a4c1-8652098bae21",
  "extracted_fields": 5,
  "processing_time_ms": 45
}`} 
                    />
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Error Responses</h4>
                    <div className="space-y-4">
                      <ResponseBlock 
                        status={400} 
                        statusText="Bad Request" 
                        body={`{
  "error": "Missing connection_id parameter"
}`} 
                      />
                      <ResponseBlock 
                        status={400} 
                        statusText="Bad Request" 
                        body={`{
  "error": "Invalid JSON payload"
}`} 
                      />
                      <ResponseBlock 
                        status={404} 
                        statusText="Not Found" 
                        body={`{
  "error": "Connection not found or inactive"
}`} 
                      />
                      <ResponseBlock 
                        status={401} 
                        statusText="Unauthorized" 
                        body={`{
  "error": "Invalid signature"
}`} 
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="stripe" className="space-y-6 mt-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                    <p className="text-sm">
                      For Stripe webhooks, use <strong>HMAC-SHA256</strong> signature validation and configure your 
                      Stripe webhook signing secret in the connection settings.
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Stripe Webhook Payload Example</h4>
                    <CodeBlock code={`curl -X POST "${WEBHOOK_BASE_URL}?connection_id=YOUR_CONNECTION_UUID" \\
  -H "Content-Type: application/json" \\
  -H "Stripe-Signature: t=1234567890,v1=abc123..." \\
  -d '{
    "id": "evt_1234567890",
    "type": "payment_intent.succeeded",
    "data": {
      "object": {
        "id": "pi_1234567890",
        "amount": 2000,
        "currency": "usd",
        "customer": "cus_1234567890",
        "receipt_email": "customer@example.com",
        "metadata": {
          "order_id": "order_123"
        }
      }
    },
    "created": 1706012400
  }'`} />
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Recommended Field Mappings</h4>
                    <div className="bg-muted/50 rounded-lg p-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">Field Name</th>
                            <th className="text-left py-2">JSON Path</th>
                            <th className="text-left py-2">Type</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono">
                          <tr className="border-b">
                            <td className="py-2">event_type</td>
                            <td className="py-2">type</td>
                            <td className="py-2">text</td>
                          </tr>
                          <tr className="border-b">
                            <td className="py-2">amount</td>
                            <td className="py-2">data.object.amount</td>
                            <td className="py-2">number</td>
                          </tr>
                          <tr className="border-b">
                            <td className="py-2">customer_email</td>
                            <td className="py-2">data.object.receipt_email</td>
                            <td className="py-2">text</td>
                          </tr>
                          <tr className="border-b">
                            <td className="py-2">customer_id</td>
                            <td className="py-2">data.object.customer</td>
                            <td className="py-2">text</td>
                          </tr>
                          <tr>
                            <td className="py-2">order_id</td>
                            <td className="py-2">data.object.metadata.order_id</td>
                            <td className="py-2">text</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="n8n" className="space-y-6 mt-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">n8n HTTP Request Node Configuration</h4>
                    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <span className="font-medium">Method:</span>
                        <span className="col-span-2 font-mono">POST</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <span className="font-medium">URL:</span>
                        <span className="col-span-2 font-mono text-xs break-all">{WEBHOOK_BASE_URL}?connection_id=YOUR_UUID</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <span className="font-medium">Body Content Type:</span>
                        <span className="col-span-2 font-mono">JSON</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <span className="font-medium">Send Body:</span>
                        <span className="col-span-2 font-mono">ON</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Example n8n JSON Body</h4>
                    <CodeBlock code={`{
  "event": "workflow.completed",
  "workflow_name": "{{ $workflow.name }}",
  "execution_id": "{{ $execution.id }}",
  "data": {
    "email": "{{ $json.email }}",
    "amount": {{ $json.amount }},
    "status": "{{ $json.status }}",
    "timestamp": "{{ $now.toISO() }}"
  }
}`} />
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">cURL Equivalent</h4>
                    <CodeBlock code={`curl -X POST "${WEBHOOK_BASE_URL}?connection_id=YOUR_CONNECTION_UUID" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event": "workflow.completed",
    "workflow_name": "My Automation",
    "execution_id": "exec_abc123",
    "data": {
      "email": "user@example.com",
      "amount": 150.00,
      "status": "success",
      "timestamp": "2026-01-23T12:30:00Z"
    }
  }'`} />
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="zapier" className="space-y-6 mt-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Zapier Webhook Configuration</h4>
                    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <span className="font-medium">Action:</span>
                        <span className="col-span-2">Webhooks by Zapier → POST</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <span className="font-medium">URL:</span>
                        <span className="col-span-2 font-mono text-xs break-all">{WEBHOOK_BASE_URL}?connection_id=YOUR_UUID</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <span className="font-medium">Payload Type:</span>
                        <span className="col-span-2 font-mono">JSON</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Example Zapier Payload</h4>
                    <CodeBlock code={`{
  "source": "zapier",
  "trigger": "new_form_submission",
  "data": {
    "form_name": "Contact Form",
    "submitted_at": "2026-01-23T12:00:00Z",
    "fields": {
      "name": "Jane Smith",
      "email": "jane@example.com",
      "phone": "+1234567890",
      "message": "I'd like to learn more about your services."
    }
  }
}`} />
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Recommended Field Mappings</h4>
                    <div className="bg-muted/50 rounded-lg p-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">Field Name</th>
                            <th className="text-left py-2">JSON Path</th>
                            <th className="text-left py-2">Type</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono">
                          <tr className="border-b">
                            <td className="py-2">form_name</td>
                            <td className="py-2">data.form_name</td>
                            <td className="py-2">text</td>
                          </tr>
                          <tr className="border-b">
                            <td className="py-2">submitted_at</td>
                            <td className="py-2">data.submitted_at</td>
                            <td className="py-2">date</td>
                          </tr>
                          <tr className="border-b">
                            <td className="py-2">contact_name</td>
                            <td className="py-2">data.fields.name</td>
                            <td className="py-2">text</td>
                          </tr>
                          <tr className="border-b">
                            <td className="py-2">contact_email</td>
                            <td className="py-2">data.fields.email</td>
                            <td className="py-2">text</td>
                          </tr>
                          <tr>
                            <td className="py-2">contact_phone</td>
                            <td className="py-2">data.fields.phone</td>
                            <td className="py-2">text</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* JSON Path Reference */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              JSON Path Reference
            </CardTitle>
            <CardDescription>How to extract data from nested payloads</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Syntax</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Use dot notation to navigate nested objects. Array access is supported with bracket notation.
                </p>
                <div className="bg-muted/50 rounded-lg p-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Path</th>
                        <th className="text-left py-2">Description</th>
                        <th className="text-left py-2">Example Value</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      <tr className="border-b">
                        <td className="py-2">event</td>
                        <td className="py-2 font-sans">Top-level field</td>
                        <td className="py-2">"payment.created"</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2">data.email</td>
                        <td className="py-2 font-sans">Nested field</td>
                        <td className="py-2">"john@example.com"</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2">data.customer.address.city</td>
                        <td className="py-2 font-sans">Deeply nested</td>
                        <td className="py-2">"New York"</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2">items[0].name</td>
                        <td className="py-2 font-sans">First array element</td>
                        <td className="py-2">"Product A"</td>
                      </tr>
                      <tr>
                        <td className="py-2">metadata.custom_field</td>
                        <td className="py-2 font-sans">Metadata fields</td>
                        <td className="py-2">"custom_value"</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              
              <div>
                <h4 className="font-semibold mb-2">Field Types</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <Badge variant="outline" className="mb-2">text</Badge>
                    <p className="text-xs text-muted-foreground">Strings, emails, IDs</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <Badge variant="outline" className="mb-2">number</Badge>
                    <p className="text-xs text-muted-foreground">Integers, decimals</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <Badge variant="outline" className="mb-2">boolean</Badge>
                    <p className="text-xs text-muted-foreground">true/false values</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <Badge variant="outline" className="mb-2">date</Badge>
                    <p className="text-xs text-muted-foreground">ISO timestamps</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Signature Validation */}
        <Card>
          <CardHeader>
            <CardTitle>Signature Validation</CardTitle>
            <CardDescription>Secure your webhooks with signature verification</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-semibold mb-2">HMAC-SHA256</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  For services like Stripe, Shopify, GitHub. The signature is computed as HMAC-SHA256 of the raw request body.
                </p>
                <CodeBlock code={`Header: X-Signature-256
Value: sha256=abc123...`} />
              </div>
              
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-semibold mb-2">Header Token</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Simple token validation via a custom header. Good for internal services or simple integrations.
                </p>
                <CodeBlock code={`Header: X-Webhook-Secret
Value: your_secret_token`} />
              </div>
            </div>
            
            <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-lg">
              <AlertCircle className="h-5 w-5 text-primary shrink-0" />
              <p className="text-sm">
                <strong>Security Note:</strong> Always use signature validation in production to prevent unauthorized webhook submissions.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Troubleshooting */}
        <Card>
          <CardHeader>
            <CardTitle>Troubleshooting</CardTitle>
            <CardDescription>Common issues and solutions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="border-l-4 border-destructive pl-4">
                <h4 className="font-semibold">400 - Missing connection_id parameter</h4>
                <p className="text-sm text-muted-foreground">
                  Ensure the <code className="bg-muted px-1 rounded">connection_id</code> query parameter is included in your URL. 
                  Copy the full endpoint URL from your connection settings.
                </p>
              </div>
              
              <div className="border-l-4 border-destructive pl-4">
                <h4 className="font-semibold">400 - Invalid JSON payload</h4>
                <p className="text-sm text-muted-foreground">
                  The request body must be valid JSON. Check for syntax errors, missing quotes, or trailing commas.
                </p>
              </div>
              
              <div className="border-l-4 border-destructive pl-4">
                <h4 className="font-semibold">404 - Connection not found</h4>
                <p className="text-sm text-muted-foreground">
                  The connection UUID is invalid or the connection has been deactivated. Verify the UUID and connection status.
                </p>
              </div>
              
              <div className="border-l-4 border-destructive pl-4">
                <h4 className="font-semibold">401 - Invalid signature</h4>
                <p className="text-sm text-muted-foreground">
                  Signature validation failed. Ensure your signing secret matches and the signature header is correctly formatted.
                </p>
              </div>
              
              <div className="border-l-4 border-muted-foreground pl-4">
                <h4 className="font-semibold">Data not appearing in records</h4>
                <p className="text-sm text-muted-foreground">
                  Ensure your connection has a dataset assigned. Without a dataset, webhooks are received but data is not extracted or stored.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
