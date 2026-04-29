CREATE TABLE IF NOT EXISTS public.whatsapp_template_media_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text NOT NULL UNIQUE,
  phone_number_id text NOT NULL,
  template_id text NULL,
  template_name text NULL,
  media_url text NOT NULL,
  media_content_type text NULL,
  media_content_length text NULL,
  updated_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_template_media_assignments_phone_number_id_idx
  ON public.whatsapp_template_media_assignments (phone_number_id);

CREATE INDEX IF NOT EXISTS whatsapp_template_media_assignments_template_id_idx
  ON public.whatsapp_template_media_assignments (template_id);

CREATE OR REPLACE FUNCTION public.set_whatsapp_template_media_assignments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_template_media_assignments_updated_at
  ON public.whatsapp_template_media_assignments;

CREATE TRIGGER trg_whatsapp_template_media_assignments_updated_at
BEFORE UPDATE ON public.whatsapp_template_media_assignments
FOR EACH ROW
EXECUTE FUNCTION public.set_whatsapp_template_media_assignments_updated_at();
