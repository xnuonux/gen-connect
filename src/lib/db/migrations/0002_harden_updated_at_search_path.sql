-- gen connect ... migration 0002 ... harden the updated_at trigger function
--
-- gen_set_updated_at() shipped in 0001 without a pinned search_path. supabase's
-- linter flags that as mutable. pinning it to empty closes the gap ... a
-- shadowed object on a caller's search_path can no longer be reached. now()
-- still resolves from pg_catalog, so the trigger keeps working untouched.

alter function public.gen_set_updated_at() set search_path = '';
