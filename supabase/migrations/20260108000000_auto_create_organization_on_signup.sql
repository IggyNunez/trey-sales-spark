-- Migration: Auto-create organization on user signup
-- This ensures every new user gets their own organization automatically

-- Function to handle new user signup and create organization
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  user_name text;
  org_name text;
  org_slug text;
BEGIN
  -- Get user name from metadata or use email prefix
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Create organization name and slug
  org_name := user_name || '''s Organization';
  org_slug := lower(regexp_replace(user_name, '[^a-zA-Z0-9]', '-', 'g')) || '-' || substring(NEW.id::text, 1, 8);

  -- Create the organization
  INSERT INTO public.organizations (name, slug, created_at, updated_at)
  VALUES (org_name, org_slug, now(), now())
  RETURNING id INTO new_org_id;

  -- Add user as owner of the organization
  INSERT INTO public.organization_members (organization_id, user_id, role, created_at, updated_at)
  VALUES (new_org_id, NEW.id, 'owner', now(), now());

  -- Create profile for the user
  INSERT INTO public.profiles (user_id, name, current_organization_id, created_at, updated_at)
  VALUES (NEW.id, user_name, new_org_id, now(), now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    name = COALESCE(profiles.name, user_name),
    current_organization_id = COALESCE(profiles.current_organization_id, new_org_id),
    updated_at = now();

  RETURN NEW;
END;
$$;

-- Create trigger on auth.users table
-- Note: This trigger fires AFTER insert, so the user is already created in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- Comment for documentation
COMMENT ON FUNCTION public.handle_new_user() IS
'Automatically creates an organization and adds the user as owner when a new user signs up. Also creates a profile entry.';
