DROP POLICY "One-time official catalog load" ON public.documents;
REVOKE INSERT ON public.documents FROM authenticated;