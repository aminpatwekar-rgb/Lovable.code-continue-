-- Store a student's academic identifiers on their profile so they can
-- manage them once from Settings and reuse them when joining classes.
alter table public.profiles
  add column if not exists roll_no text,
  add column if not exists er_no text,
  add column if not exists sr_no text;

-- Keep class rosters in sync when a student changes their identifiers.
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
  if _user_id is null then
    raise exception 'Not authenticated';
  end if;

  if _name is null then
    raise exception 'Full name cannot be empty';
  end if;

  if _roll is null and _er is null and _sr is null then
    raise exception 'Enter at least one of Roll No., ER No., or Sr No.';
  end if;

  update public.profiles
  set
    full_name = _name,
    roll_no = _roll,
    er_no = _er,
    sr_no = _sr,
    updated_at = now()
  where id = _user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  update public.class_members
  set
    full_name = _name,
    roll_no = _roll,
    er_no = _er,
    sr_no = _sr
  where student_id = _user_id
    and member_role = 'student';
end;
$$;

grant execute on function public.update_student_identifiers(text, text, text, text)
to authenticated;
