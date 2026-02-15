-- Create storage bucket for scraper evidence (screenshots)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence',
  'evidence',
  false,                              -- private bucket (accessed via service role)
  5242880,                            -- 5 MB max per file
  ARRAY['image/png', 'image/jpeg']    -- only screenshots
)
ON CONFLICT (id) DO NOTHING;

-- RLS: service role can manage all objects; users can read their own screenshots
CREATE POLICY "Service role full access on evidence"
  ON storage.objects FOR ALL
  USING (bucket_id = 'evidence')
  WITH CHECK (bucket_id = 'evidence');

CREATE POLICY "Users can view own screenshots"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'evidence'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );
