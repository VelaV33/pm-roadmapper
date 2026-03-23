-- User profiles with tier
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'basic' CHECK (tier IN ('basic', 'premium')),
  tier_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access" ON user_profiles FOR ALL USING (true);

-- Competitive analyses storage
CREATE TABLE IF NOT EXISTS competitive_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  competitors TEXT[] NOT NULL,
  research_areas TEXT[] NOT NULL,
  results JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','complete','error')),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE competitive_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their analyses" ON competitive_analyses FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_competitive_analyses_user ON competitive_analyses(user_id, created_at DESC);
