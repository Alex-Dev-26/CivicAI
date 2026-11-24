CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE POLICY "Team can read official catalog snapshots" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='civic-catalog');
CREATE TABLE public.catalog_imports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id bigint NOT NULL, imported_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.catalog_imports TO service_role;
ALTER TABLE public.catalog_imports ENABLE ROW LEVEL SECURITY;