/*\n  # Add Google linked tracking to profiles\n\n  1. Changes\n    - Add `google_linked` column to profiles table to track explicit Google account linking\n    - Defaults to false for existing users\n  \n  2. Purpose\n    - Distinguish between explicitly linked accounts (via profile settings)\n    - Prevent automatic account merging while allowing intentional linking\n*/\n\nDO $$ \nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.columns \n    WHERE table_name = 'profiles' AND column_name = 'google_linked'\n  ) THEN\n    ALTER TABLE profiles ADD COLUMN google_linked BOOLEAN DEFAULT false;
\n  END IF;
\nEND $$;
;
