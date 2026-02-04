-- Update Cal.com auto-sync cron job from 30 minutes to 10 minutes
-- First unschedule the existing job
SELECT cron.unschedule('auto-sync-calcom-30min');

-- Schedule new job running every 10 minutes (at 0, 10, 20, 30, 40, 50 past each hour)
SELECT cron.schedule(
  'auto-sync-calcom-10min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://edggwlqjrdmmuzhyggoq.supabase.co/functions/v1/auto-sync-calcom',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ2d3bHFqcmRtbXV6aHlnZ29xIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzEwNjQ2MCwiZXhwIjoyMDgyNjgyNDYwfQ.JD05l6uMz0oFYzGT6RSBrNYRg6w62L0mi1ezhmNTmGQ'
    ),
    body := '{}'::jsonb
  );
  $$
);