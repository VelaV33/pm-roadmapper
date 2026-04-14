-- Initiative Templates table
-- Stores reusable task templates scoped to platform, organization, or team level.

CREATE TABLE IF NOT EXISTS public.initiative_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text,
  category        text NOT NULL,
  tags            text[] DEFAULT '{}',
  icon            text DEFAULT 'clipboard',

  -- Scope: exactly ONE determines visibility
  scope           text NOT NULL DEFAULT 'platform' CHECK (scope IN ('platform','organization','team')),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id         uuid REFERENCES public.teams(id) ON DELETE CASCADE,

  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- The payload
  tasks           jsonb NOT NULL DEFAULT '[]',

  -- Metadata
  task_count      integer NOT NULL DEFAULT 0,
  total_hours     numeric(10,1) NOT NULL DEFAULT 0,
  phases          text[] DEFAULT '{}',
  estimated_duration_weeks integer,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS templates_scope_idx ON public.initiative_templates (scope);
CREATE INDEX IF NOT EXISTS templates_org_idx ON public.initiative_templates (organization_id);
CREATE INDEX IF NOT EXISTS templates_team_idx ON public.initiative_templates (team_id);
CREATE INDEX IF NOT EXISTS templates_category_idx ON public.initiative_templates (category);

ALTER TABLE public.initiative_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.initiative_templates FORCE ROW LEVEL SECURITY;

-- Platform templates: everyone can read
CREATE POLICY "Anyone reads platform templates" ON public.initiative_templates
  FOR SELECT USING (scope = 'platform');

-- Org templates: members of the org can read
CREATE POLICY "Org members read org templates" ON public.initiative_templates
  FOR SELECT USING (
    scope = 'organization' AND organization_id IN (
      SELECT organization_id FROM public.user_profiles WHERE user_id = auth.uid() AND organization_id IS NOT NULL
    )
  );

-- Team templates: team members can read
CREATE POLICY "Team members read team templates" ON public.initiative_templates
  FOR SELECT USING (
    scope = 'team' AND team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- Platform admins can manage all templates
CREATE POLICY "Platform admins manage templates" ON public.initiative_templates
  FOR ALL USING (
    (SELECT raw_app_meta_data->>'platform_admin' FROM auth.users WHERE id = auth.uid()) = 'true'
    OR (SELECT raw_app_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'super_admin'
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.templates_touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS templates_updated_at_trigger ON public.initiative_templates;
CREATE TRIGGER templates_updated_at_trigger
BEFORE UPDATE ON public.initiative_templates
FOR EACH ROW EXECUTE FUNCTION public.templates_touch_updated_at();
