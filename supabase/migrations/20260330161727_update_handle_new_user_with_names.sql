/*\n  # Update handle_new_user function to include first and last names\n\n  1. Changes\n    - Update handle_new_user function to extract first_name and last_name from user metadata\n    - These values will be provided during signup from the frontend\n*/\n\nCREATE OR REPLACE FUNCTION handle_new_user()\nRETURNS trigger\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = ''\nAS $$\nBEGIN\n  INSERT INTO public.profiles (id, first_name, last_name, email, created_at, updated_at)\n  VALUES (\n    NEW.id,\n    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),\n    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),\n    NEW.email,\n    NOW(),\n    NOW()\n  )\n  ON CONFLICT (id) DO NOTHING;
\n  RETURN NEW;
\nEND;
\n$$;
\n;
