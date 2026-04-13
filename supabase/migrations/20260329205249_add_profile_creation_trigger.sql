/*\n  # Add automatic profile creation trigger\n\n  1. Changes\n    - Create a function to automatically create a profile when a user signs up\n    - Add a trigger to call this function on new auth.users\n\n  2. Security\n    - Ensures every user has a profile record\n    - Prevents authentication/profile sync issues\n*/\n\n-- Create function to handle new user profile creation\nCREATE OR REPLACE FUNCTION public.handle_new_user()\nRETURNS trigger AS $$\nBEGIN\n  INSERT INTO public.profiles (id, email, full_name, is_admin, role, created_at, updated_at)\n  VALUES (\n    NEW.id,\n    NEW.email,\n    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),\n    false,\n    'customer',\n    NOW(),\n    NOW()\n  );
\n  RETURN NEW;
\nEND;
\n$$ LANGUAGE plpgsql SECURITY DEFINER;
\n\n-- Create trigger to automatically create profile on signup\nDROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
\nCREATE TRIGGER on_auth_user_created\n  AFTER INSERT ON auth.users\n  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
\n;
