ALTER POLICY "Team can read official catalog snapshots" ON storage.objects
USING (bucket_id = 'civic-catalog' AND owner_id = (SELECT auth.uid()::text));
COMMENT ON POLICY "Team can read official catalog snapshots" ON storage.objects IS 'Catalog snapshot downloads are restricted to the authenticated uploader; trusted service maintenance retains privileged access.';