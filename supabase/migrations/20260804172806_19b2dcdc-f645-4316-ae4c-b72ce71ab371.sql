
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('student','teacher','admin');
CREATE TYPE public.submission_type AS ENUM ('handwritten','typed','either');
CREATE TYPE public.submission_status AS ENUM ('not_started','in_progress','submitted','late','reviewed','returned','completed');

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  avatar_url TEXT,
  institution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "roles_self_read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- new user handler
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  r := CASE WHEN NEW.raw_user_meta_data->>'role' = 'teacher' THEN 'teacher'::public.app_role
            ELSE 'student'::public.app_role END;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, r) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- CLASSES
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  section TEXT,
  subject TEXT,
  description TEXT,
  join_code TEXT NOT NULL UNIQUE,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.class_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, student_id)
);
GRANT SELECT, INSERT, DELETE ON public.class_members TO authenticated;
GRANT ALL ON public.class_members TO service_role;
ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_class_teacher(_class_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.classes WHERE id = _class_id AND teacher_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_class_member(_class_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.class_members WHERE class_id = _class_id AND student_id = _user_id);
$$;

CREATE POLICY "classes_read" ON public.classes FOR SELECT TO authenticated
  USING (teacher_id = auth.uid() OR public.is_class_member(id, auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "classes_insert" ON public.classes FOR INSERT TO authenticated
  WITH CHECK (teacher_id = auth.uid() AND public.has_role(auth.uid(),'teacher'));
CREATE POLICY "classes_update" ON public.classes FOR UPDATE TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "classes_delete" ON public.classes FOR DELETE TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER classes_updated BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "members_read" ON public.class_members FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.is_class_teacher(class_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "members_join" ON public.class_members FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());
CREATE POLICY "members_delete" ON public.class_members FOR DELETE TO authenticated
  USING (student_id = auth.uid() OR public.is_class_teacher(class_id, auth.uid()));

-- lookup class by join code (security definer, returns minimal info)
CREATE OR REPLACE FUNCTION public.join_class_by_code(_code TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid UUID;
BEGIN
  SELECT id INTO cid FROM public.classes WHERE upper(join_code) = upper(trim(_code)) AND archived = false;
  IF cid IS NULL THEN RAISE EXCEPTION 'Invalid join code'; END IF;
  INSERT INTO public.class_members (class_id, student_id) VALUES (cid, auth.uid()) ON CONFLICT DO NOTHING;
  RETURN cid;
END; $$;
GRANT EXECUTE ON FUNCTION public.join_class_by_code(TEXT) TO authenticated;

-- ASSIGNMENTS
CREATE TABLE public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject TEXT,
  description TEXT,
  instructions TEXT,
  due_date TIMESTAMPTZ,
  max_marks NUMERIC NOT NULL DEFAULT 100,
  priority TEXT NOT NULL DEFAULT 'normal',
  submission_type public.submission_type NOT NULL DEFAULT 'either',
  is_group BOOLEAN NOT NULL DEFAULT false,
  rubric JSONB,
  reference_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  allow_autocorrect BOOLEAN NOT NULL DEFAULT true,
  allow_voice_typing BOOLEAN NOT NULL DEFAULT true,
  allow_links BOOLEAN NOT NULL DEFAULT true,
  allow_images BOOLEAN NOT NULL DEFAULT true,
  published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignments_read" ON public.assignments FOR SELECT TO authenticated
  USING (teacher_id = auth.uid() OR public.is_class_member(class_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "assignments_insert" ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (teacher_id = auth.uid() AND public.is_class_teacher(class_id, auth.uid()));
CREATE POLICY "assignments_update" ON public.assignments FOR UPDATE TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "assignments_delete" ON public.assignments FOR DELETE TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER assignments_updated BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.assignment_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.assignment_attachments TO authenticated;
GRANT ALL ON public.assignment_attachments TO service_role;
ALTER TABLE public.assignment_attachments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_assignment(_assignment_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = _assignment_id
      AND (a.teacher_id = _user_id OR public.is_class_member(a.class_id, _user_id))
  );
$$;
CREATE OR REPLACE FUNCTION public.is_assignment_owner(_assignment_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.assignments WHERE id = _assignment_id AND teacher_id = _user_id);
$$;

CREATE POLICY "att_read" ON public.assignment_attachments FOR SELECT TO authenticated
  USING (public.can_view_assignment(assignment_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "att_write" ON public.assignment_attachments FOR INSERT TO authenticated
  WITH CHECK (public.is_assignment_owner(assignment_id, auth.uid()));
CREATE POLICY "att_delete" ON public.assignment_attachments FOR DELETE TO authenticated
  USING (public.is_assignment_owner(assignment_id, auth.uid()));

-- SUBMISSIONS
CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.submission_status NOT NULL DEFAULT 'in_progress',
  mode TEXT NOT NULL DEFAULT 'typed',
  typed_content TEXT,
  typed_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  submitted_at TIMESTAMPTZ,
  is_late BOOLEAN NOT NULL DEFAULT false,
  marks_awarded NUMERIC,
  teacher_feedback TEXT,
  improvement_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  paste_violation_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions TO authenticated;
GRANT ALL ON public.submissions TO service_role;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sub_read" ON public.submissions FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.is_assignment_owner(assignment_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "sub_insert" ON public.submissions FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() AND public.can_view_assignment(assignment_id, auth.uid()));
CREATE POLICY "sub_update" ON public.submissions FOR UPDATE TO authenticated
  USING (student_id = auth.uid() OR public.is_assignment_owner(assignment_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "sub_delete" ON public.submissions FOR DELETE TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER submissions_updated BEFORE UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.can_view_submission(_submission_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.id = _submission_id
      AND (s.student_id = _user_id OR public.is_assignment_owner(s.assignment_id, _user_id))
  );
$$;
CREATE OR REPLACE FUNCTION public.owns_submission(_submission_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.submissions WHERE id = _submission_id AND student_id = _user_id);
$$;
CREATE OR REPLACE FUNCTION public.reviews_submission(_submission_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.submissions s JOIN public.assignments a ON a.id = s.assignment_id
    WHERE s.id = _submission_id AND a.teacher_id = _user_id
  );
$$;

CREATE TABLE public.submission_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  page_order INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'page',
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_files TO authenticated;
GRANT ALL ON public.submission_files TO service_role;
ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subfile_read" ON public.submission_files FOR SELECT TO authenticated
  USING (public.can_view_submission(submission_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "subfile_write" ON public.submission_files FOR INSERT TO authenticated
  WITH CHECK (public.owns_submission(submission_id, auth.uid()));
CREATE POLICY "subfile_update" ON public.submission_files FOR UPDATE TO authenticated
  USING (public.owns_submission(submission_id, auth.uid()));
CREATE POLICY "subfile_delete" ON public.submission_files FOR DELETE TO authenticated
  USING (public.owns_submission(submission_id, auth.uid()));

CREATE TABLE public.annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  submission_file_id UUID REFERENCES public.submission_files(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annotations TO authenticated;
GRANT ALL ON public.annotations TO service_role;
ALTER TABLE public.annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ann_read" ON public.annotations FOR SELECT TO authenticated
  USING (public.can_view_submission(submission_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "ann_write" ON public.annotations FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.reviews_submission(submission_id, auth.uid()));
CREATE POLICY "ann_delete" ON public.annotations FOR DELETE TO authenticated
  USING (author_id = auth.uid());

CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cm_read" ON public.comments FOR SELECT TO authenticated
  USING (public.can_view_submission(submission_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "cm_write" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.can_view_submission(submission_id, auth.uid()));
CREATE POLICY "cm_delete" ON public.comments FOR DELETE TO authenticated USING (author_id = auth.uid());

CREATE TABLE public.paste_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.paste_violations TO authenticated;
GRANT ALL ON public.paste_violations TO service_role;
ALTER TABLE public.paste_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pv_read" ON public.paste_violations FOR SELECT TO authenticated
  USING (public.can_view_submission(submission_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "pv_write" ON public.paste_violations FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() AND public.owns_submission(submission_id, auth.uid()));

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  kind TEXT NOT NULL DEFAULT 'info',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nt_read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "nt_update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "nt_insert" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "nt_delete" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX ON public.assignments (class_id);
CREATE INDEX ON public.submissions (assignment_id);
CREATE INDEX ON public.submissions (student_id);
CREATE INDEX ON public.class_members (student_id);
