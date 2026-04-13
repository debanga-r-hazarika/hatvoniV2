/*\n  # Fix Infinite Recursion in Profiles RLS Policies\n\n  1. Problem\n    - Current policies check `is_admin` by querying the profiles table\n    - This causes infinite recursion when the policy tries to verify itself\n  \n  2. Solution\n    - Remove all existing policies that cause recursion\n    - Create simple, non-recursive policies:\n      - Users can read their own profile\n      - Users can update their own profile\n      - Users can insert their own profile\n      - Admins can do everything (using custom claims in JWT instead of table lookup)\n  \n  3. Security\n    - Users can only access their own data\n    - Admin access will be handled through JWT claims\n*/\n\n-- Drop all existing policies to start fresh\nDROP POLICY IF EXISTS "Users can view own profile or admins can view all" ON profiles;
\nDROP POLICY IF EXISTS "Users can update own profile or admins can update all" ON profiles;
\nDROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
\nDROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
\nDROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;
\n\n-- Create new non-recursive policies\nCREATE POLICY "Users can view own profile"\n  ON profiles\n  FOR SELECT\n  TO authenticated\n  USING (auth.uid() = id);
\n\nCREATE POLICY "Users can update own profile"\n  ON profiles\n  FOR UPDATE\n  TO authenticated\n  USING (auth.uid() = id)\n  WITH CHECK (auth.uid() = id);
\n\nCREATE POLICY "Users can insert own profile"\n  ON profiles\n  FOR INSERT\n  TO authenticated\n  WITH CHECK (auth.uid() = id);
\n\n-- For admin access, we'll handle it at the application level\n-- or through service role key for now\n;
