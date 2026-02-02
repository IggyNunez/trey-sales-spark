-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily sync of setter activities at 11pm EST (4am UTC during EST, 3am UTC during EDT)
-- Using 4am UTC which is 11pm EST / 12am EDT
SELECT cron.schedule(
  'sync-setter-activities-daily',
  '0 4 * * *',  -- 4am UTC daily = 11pm EST
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-close-activities',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object(
      'organizationId', (SELECT id FROM organizations LIMIT 1),
      'startDate', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
      'endDate', to_char(CURRENT_DATE, 'YYYY-MM-DD')
    )
  );
  $$
);