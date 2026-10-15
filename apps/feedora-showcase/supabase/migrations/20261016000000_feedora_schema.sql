-- ============================================================================
-- Feedora Database Schema for Supabase (PostgreSQL)
-- Aligned 1:1 with Django Gihini-Uni/research models:
--   accounts/models.py (User, Organization, CreatorProfile, RespondentProfile)
--   surveys/models.py  (Survey, Question, Response, Answer)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Organizations (mirrors accounts_organization)
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  org_name TEXT NOT NULL,
  org_type TEXT NOT NULL CHECK (org_type IN ('university', 'school', 'company', 'research', 'other')),
  user_role TEXT DEFAULT 'Researcher',
  country TEXT DEFAULT 'Sri Lanka',
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Creator Profiles (mirrors accounts_creatorprofile)
CREATE TABLE IF NOT EXISTS public.creator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  display_name TEXT NOT NULL,
  company TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  website TEXT DEFAULT '',
  avatar TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Respondent Profiles (mirrors accounts_respondentprofile)
CREATE TABLE IF NOT EXISTS public.respondent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  display_name TEXT NOT NULL,
  company TEXT DEFAULT '',
  gender TEXT CHECK (gender IN ('M', 'F', 'NB', 'NS')),
  age_group TEXT CHECK (age_group IN ('under18', '18-24', '25-34', '35-44', '45+')),
  avatar TEXT DEFAULT 'default',
  total_points INTEGER DEFAULT 0 CHECK (total_points >= 0),
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Surveys (mirrors surveys_survey)
CREATE TABLE IF NOT EXISTS public.surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_hmsam BOOLEAN DEFAULT false,
  access_uuid UUID DEFAULT gen_random_uuid() UNIQUE,
  access_code VARCHAR(6) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_draft BOOLEAN DEFAULT false,
  theme_accent TEXT DEFAULT '#14140f',
  theme_bg TEXT DEFAULT '#fafaf7',
  submit_label TEXT DEFAULT 'Submit',
  features JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Questions (mirrors surveys_question)
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID REFERENCES public.surveys(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  code VARCHAR(10) DEFAULT '',
  question_type TEXT NOT NULL CHECK (question_type IN ('likert', 'mcq', 'open', 'short')),
  hmsam_construct TEXT CHECK (hmsam_construct IN ('peou', 'pu', 'joy', 'curiosity', 'control', 'fi', 'biu', NULL)),
  "order" INTEGER DEFAULT 0 NOT NULL,
  is_required BOOLEAN DEFAULT true,
  rating_style TEXT DEFAULT 'stars',
  rating_max INTEGER DEFAULT 5,
  section_title TEXT DEFAULT '',
  section_num INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. MCQ Options (mirrors surveys_mcqoption)
CREATE TABLE IF NOT EXISTS public.mcq_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  "order" INTEGER DEFAULT 0 NOT NULL
);

-- 7. Responses (mirrors surveys_response)
CREATE TABLE IF NOT EXISTS public.responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID REFERENCES public.surveys(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  points_earned INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Answers (mirrors surveys_answer)
CREATE TABLE IF NOT EXISTS public.answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID REFERENCES public.responses(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  likert_value INTEGER CHECK (likert_value >= 1 AND likert_value <= 7),
  text_value TEXT DEFAULT '',
  selected_option_id UUID REFERENCES public.mcq_options(id) ON DELETE SET NULL
);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.respondent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcq_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;

-- Organizations policies
CREATE POLICY "Public can view organizations"
  ON public.organizations FOR SELECT USING (true);

CREATE POLICY "Users can manage their own organization"
  ON public.organizations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Profiles policies
CREATE POLICY "Profiles viewable by public"
  ON public.respondent_profiles FOR SELECT USING (true);

CREATE POLICY "Respondents can manage their own profile"
  ON public.respondent_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Creator profiles viewable by public"
  ON public.creator_profiles FOR SELECT USING (true);

CREATE POLICY "Creators can manage their own profile"
  ON public.creator_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Surveys & Questions policies
CREATE POLICY "Public can view active surveys"
  ON public.surveys FOR SELECT
  USING (is_active = true OR auth.uid() = organization_user_id);

CREATE POLICY "Creators manage their surveys"
  ON public.surveys FOR ALL
  USING (auth.uid() = organization_user_id)
  WITH CHECK (auth.uid() = organization_user_id);

CREATE POLICY "Public can view survey questions"
  ON public.questions FOR SELECT USING (true);

CREATE POLICY "Public can view options"
  ON public.mcq_options FOR SELECT USING (true);

-- Responses & Answers policies
CREATE POLICY "Users can create responses"
  ON public.responses FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users view their own responses or survey creators view survey responses"
  ON public.responses FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.surveys WHERE surveys.id = responses.survey_id AND surveys.organization_user_id = auth.uid())
  );

CREATE POLICY "Users can insert answers for their response"
  ON public.answers FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.responses WHERE responses.id = answers.response_id AND (responses.user_id = auth.uid() OR responses.user_id IS NULL))
  );

CREATE POLICY "Users can view answers"
  ON public.answers FOR SELECT USING (true);
