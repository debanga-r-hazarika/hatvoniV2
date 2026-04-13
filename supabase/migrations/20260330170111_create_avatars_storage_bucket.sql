-- Create avatars storage bucket\n-- 1. New Storage: Create avatars bucket for user profile photos with public access\n-- 2. Security: Users can upload, update, delete own avatars. Public read access.\n\nINSERT INTO storage.buckets (id, name, public)\nVALUES ('avatars', 'avatars', true)\nON CONFLICT (id) DO NOTHING;
\n\nCREATE POLICY "Anyone can view avatars"\n  ON storage.objects FOR SELECT\n  USING (bucket_id = 'avatars');
\n\nCREATE POLICY "Authenticated users can upload own avatar"\n  ON storage.objects FOR INSERT\n  TO authenticated\n  WITH CHECK (\n    bucket_id = 'avatars'\n    AND (storage.foldername(name))[1] = auth.uid()::text\n  );
\n\nCREATE POLICY "Users can update own avatar"\n  ON storage.objects FOR UPDATE\n  TO authenticated\n  USING (\n    bucket_id = 'avatars'\n    AND (storage.foldername(name))[1] = auth.uid()::text\n  )\n  WITH CHECK (\n    bucket_id = 'avatars'\n    AND (storage.foldername(name))[1] = auth.uid()::text\n  );
\n\nCREATE POLICY "Users can delete own avatar"\n  ON storage.objects FOR DELETE\n  TO authenticated\n  USING (\n    bucket_id = 'avatars'\n    AND (storage.foldername(name))[1] = auth.uid()::text\n  );
\n;
