/*\n  # Update profile creation trigger for first_name and last_name\n\n  1. Changes\n    - Update the handle_new_user() function to use first_name and last_name\n    - Extract first_name and last_name from user metadata\n  \n  2. Security\n    - No changes to security policies\n*/\n\n-- Update function to handle new user profile creation with first_name and last_name\nCREATE OR REPLACE FUNCTION public.handle_new_user()\nRETURNS trigger AS $$\nBEGIN\n  INSERT INTO public.profiles (id, email, first_name, last_name, is_admin, role, created_at, updated_at)\n  VALUES (\n    NEW.id,\n    NEW.email,\n    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),\n    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),\n    false,\n    'customer',\n    NOW(),\n    NOW()\n  );
\n  RETURN NEW;
\nEND;
\n$$ LANGUAGE plpgsql SECURITY DEFINER;
;
