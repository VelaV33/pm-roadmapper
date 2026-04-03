-- Fix roadmap_data RLS policies to allow authenticated users to access their own data
DROP POLICY IF EXISTS "Users own their roadmap data" ON roadmap_data;
DROP POLICY IF EXISTS "Users read own data" ON roadmap_data;
DROP POLICY IF EXISTS "Users write own data" ON roadmap_data;
DROP POLICY IF EXISTS "Users update own data" ON roadmap_data;

CREATE POLICY "Users read own data" ON roadmap_data FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users write own data" ON roadmap_data FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own data" ON roadmap_data FOR UPDATE USING (auth.uid() = user_id);

-- Fix shared_roadmaps RLS policies
DROP POLICY IF EXISTS "Users manage shares" ON shared_roadmaps;
DROP POLICY IF EXISTS "Owners manage shares" ON shared_roadmaps;
DROP POLICY IF EXISTS "Recipients read shares" ON shared_roadmaps;

CREATE POLICY "Owners manage shares" ON shared_roadmaps FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "Recipients read shares" ON shared_roadmaps FOR SELECT USING (
  recipient_email = (SELECT email FROM auth.users WHERE id = auth.uid())
);
