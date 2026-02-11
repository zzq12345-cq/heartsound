-- ============================================================================
-- 006: Knowledge Base Tables
-- 健康知识科普模块数据表
-- ============================================================================

-- Article Categories - 文章分类表
CREATE TABLE IF NOT EXISTS article_categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  icon        TEXT NOT NULL DEFAULT 'heart',
  color       TEXT NOT NULL DEFAULT '#2E8B8B',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  article_count INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Articles - 文章表
CREATE TABLE IF NOT EXISTS articles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   INTEGER NOT NULL REFERENCES article_categories(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  summary       TEXT,
  content       TEXT NOT NULL,
  cover_image   TEXT,
  author        TEXT NOT NULL DEFAULT '心音智鉴',
  read_time     INTEGER NOT NULL DEFAULT 3,
  tags          JSONB DEFAULT '[]'::jsonb,
  view_count    INTEGER NOT NULL DEFAULT 0,
  is_published  BOOLEAN NOT NULL DEFAULT true,
  is_featured   BOOLEAN NOT NULL DEFAULT false,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_articles_category_id ON articles(category_id);
CREATE INDEX IF NOT EXISTS idx_articles_is_published ON articles(is_published);
CREATE INDEX IF NOT EXISTS idx_articles_is_featured ON articles(is_featured);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_sort_order ON articles(sort_order, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_categories_slug ON article_categories(slug);
CREATE INDEX IF NOT EXISTS idx_article_categories_sort ON article_categories(sort_order);

-- ============================================================================
-- RLS Policies - All users can read published articles
-- ============================================================================

ALTER TABLE article_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

-- Anyone can read active categories
CREATE POLICY "Anyone can read active categories"
  ON article_categories FOR SELECT
  USING (is_active = true);

-- Anyone can read published articles
CREATE POLICY "Anyone can read published articles"
  ON articles FOR SELECT
  USING (is_published = true);

-- Allow anonymous to increment view_count
CREATE POLICY "Anyone can update article view count"
  ON articles FOR UPDATE
  USING (is_published = true)
  WITH CHECK (is_published = true);

-- ============================================================================
-- Seed: Initial Categories
-- ============================================================================

INSERT INTO article_categories (name, slug, icon, color, sort_order) VALUES
  ('心脏基础知识', 'heart-basics',    'heart',       '#2E8B8B', 1),
  ('常见心脏问题', 'heart-problems',  'heart-pulse', '#C75450', 2),
  ('健康生活建议', 'healthy-living',  'lightbulb',   '#3CB371', 3),
  ('就医指导',     'medical-guide',   'medical',     '#5B7FA5', 4)
ON CONFLICT (slug) DO NOTHING;
