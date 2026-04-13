-- Organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  domain      text,                    -- e.g. 'netstar.co.za' for auto-matching
  logo_url    text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS organizations_domain_idx ON public.organizations (lower(domain));

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;

-- Add organization_id to user_profiles BEFORE any policy references it
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS user_profiles_org_idx ON public.user_profiles (organization_id);

-- Now create policies (organization_id column exists)
CREATE POLICY "Admins read all orgs" ON public.organizations
  FOR SELECT USING (
    (SELECT raw_app_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) IN ('super_admin')
    OR (SELECT raw_app_meta_data->>'platform_admin' FROM auth.users WHERE id = auth.uid()) = 'true'
  );

CREATE POLICY "Members read own org" ON public.organizations
  FOR SELECT USING (
    id IN (SELECT organization_id FROM public.user_profiles WHERE user_id = auth.uid() AND organization_id IS NOT NULL)
  );

CREATE POLICY "Platform admins manage orgs" ON public.organizations
  FOR ALL USING (
    (SELECT raw_app_meta_data->>'platform_admin' FROM auth.users WHERE id = auth.uid()) = 'true'
  );

-- Updated_at trigger for organizations
CREATE OR REPLACE FUNCTION public.organizations_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organizations_updated_at_trigger ON public.organizations;
CREATE TRIGGER organizations_updated_at_trigger
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.organizations_touch_updated_at();
