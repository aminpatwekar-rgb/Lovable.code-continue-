-- Align the standalone Supabase project with the current ONYX student profile/join flow.
alter table public.profiles
  add column if not exists roll_no text,
  add column if not exists er_no text,
  add column if not exists sr_no text;

create or replace function public.update_student_identifiers(
  _full_name text,
  _roll_no text,
  _er_no text,
  _sr_no text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _name text := nullif(trim(_full_name), '');
  _roll text := nullif(trim(_roll_no), '');
  _er text := nullif(trim(_er_no), '');
  _sr text := nullif(trim(_sr_no), '');
begin
  if _user_id is null then raise exception 'Not authenticated'; end if;
  if _name is null then raise exception 'Full name cannot be empty'; end if;
  if _roll is null and _er is null and _sr is null then
    raise exception 'Enter at least one of Roll No., ER No., or Sr No.';
  end if;

  update public.profiles
  set full_name = _name, roll_no = _roll, er_no = _er, sr_no = _sr, updated_at = now()
  where id = _user_id;

  if not found then raise exception 'Profile not found'; end if;

  update public.class_members
  set full_name = _name, roll_no = _roll, er_no = _er, sr_no = _sr
  where student_id = _user_id and member_role = 'student';
end;
$$;

revoke execute on function public.update_student_identifiers(text, text, text, text) from public, anon;
grant execute on function public.update_student_identifiers(text, text, text, text) to authenticated;

create or replace function public.join_class_by_code(
  _code text,
  _full_name text,
  _roll_no text,
  _er_no text,
  _sr_no text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  cid uuid;
  _name text := nullif(trim(_full_name), '');
  _roll text := nullif(trim(_roll_no), '');
  _er text := nullif(trim(_er_no), '');
  _sr text := nullif(trim(_sr_no), '');
begin
  if _user_id is null then raise exception 'Not authenticated'; end if;
  if _name is null then raise exception 'Full name cannot be empty'; end if;
  if _roll is null and _er is null and _sr is null then
    raise exception 'Enter at least one of Roll No., ER No., or Sr No.';
  end if;

  select id into cid from public.classes
  where upper(join_code) = upper(trim(_code)) and archived = false;

  if cid is null then raise exception 'Invalid join code'; end if;
  if exists (select 1 from public.classes where id = cid and teacher_id = _user_id) then
    raise exception 'Class owner cannot join their own class';
  end if;

  update public.profiles
  set full_name = _name, roll_no = _roll, er_no = _er, sr_no = _sr, updated_at = now()
  where id = _user_id;

  if not found then raise exception 'Profile not found'; end if;

  insert into public.class_members (class_id, student_id, full_name, roll_no, er_no, sr_no, member_role)
  values (cid, _user_id, _name, _roll, _er, _sr, 'student')
  on conflict (class_id, student_id) do update set
    full_name = excluded.full_name,
    roll_no = excluded.roll_no,
    er_no = excluded.er_no,
    sr_no = excluded.sr_no,
    member_role = 'student';

  return cid;
end;
$$;

revoke execute on function public.join_class_by_code(text, text, text, text, text) from public, anon;
grant execute on function public.join_class_by_code(text, text, text, text, text) to authenticated;
