CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE OR REPLACE FUNCTION public._new_institution_join_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
  b bytea;
  i int;
BEGIN
  LOOP
    b := extensions.gen_random_bytes(16);
    c := '';
    FOR i IN 0..15 LOOP
      c := c || substr(chars, 1 + (get_byte(b, i) % 32), 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.institution_join_links l WHERE l.code = c) THEN
      RETURN c;
    END IF;
  END LOOP;
END;
$function$;