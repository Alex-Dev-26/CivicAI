REVOKE INSERT, UPDATE, DELETE ON public.documents FROM anon, authenticated;
GRANT SELECT ON public.documents TO anon, authenticated;