-- Straightline schema — run in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS locations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        UNIQUE NOT NULL,
  browser_use JSONB,        -- { adaPercent, grade, compliance, limitations }
  map_3d      JSONB,        -- reserved for future 3D point cloud metadata
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE locations DISABLE ROW LEVEL SECURITY;
