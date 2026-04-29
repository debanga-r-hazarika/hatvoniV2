-- Remove legacy admin_approve_item overload to avoid PostgREST RPC ambiguity.
DROP FUNCTION IF EXISTS public.admin_approve_item(uuid, text, text, text, jsonb);
