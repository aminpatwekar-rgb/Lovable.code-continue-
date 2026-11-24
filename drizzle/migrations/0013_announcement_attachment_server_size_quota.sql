CREATE OR REPLACE FUNCTION public.enforce_announcement_attachment_size()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE real_size bigint; author uuid; lim bigint; used bigint;
BEGIN
  SELECT (o.metadata->>'size')::bigint INTO real_size
  FROM storage.objects o
  WHERE o.bucket_id = 'announcement-attachments' AND o.name = NEW.storage_path;
  IF real_size IS NULL THEN
    RAISE EXCEPTION 'Uploaded file not found';
  END IF;
  IF split_part(NEW.storage_path, '/', 1) <> NEW.announcement_id::text THEN
    RAISE EXCEPTION 'Invalid attachment path';
  END IF;
  NEW.size_bytes := real_size;
  SELECT author_id INTO author FROM public.announcements WHERE id = NEW.announcement_id;
  lim := public.plan_limit(author, 'storage_bytes');
  used := public.get_storage_usage(author);
  IF lim >= 0 AND used + real_size > lim THEN
    RAISE EXCEPTION 'Storage limit reached';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_announcement_attachment_size() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS announcement_attachment_size_guard ON public.announcement_attachments;
CREATE TRIGGER announcement_attachment_size_guard
BEFORE INSERT ON public.announcement_attachments
FOR EACH ROW EXECUTE FUNCTION public.enforce_announcement_attachment_size();