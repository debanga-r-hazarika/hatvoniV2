
-- Update the build_customer_sync_payload function to include order history
CREATE OR REPLACE FUNCTION private.build_customer_sync_payload(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  p profiles%ROWTYPE;
  addresses_payload jsonb;
  default_address_payload jsonb;
  orders_payload jsonb;
  order_count integer;
  total_spent numeric;
BEGIN
  SELECT *
  INTO p
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Get all addresses
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'street', a.address_line1,
        'city', a.city,
        'state', a.state,
        'postal_code', a.postal_code,
        'country', a.country,
        'is_default', a.is_default
      )
      ORDER BY a.is_default DESC, a.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO addresses_payload
  FROM public.addresses a
  WHERE a.user_id = p_user_id;

  -- Get default address
  SELECT jsonb_build_object(
    'id', a.id,
    'street', a.address_line1,
    'city', a.city,
    'state', a.state,
    'postal_code', a.postal_code,
    'country', a.country,
    'is_default', a.is_default
  )
  INTO default_address_payload
  FROM public.addresses a
  WHERE a.user_id = p_user_id
  ORDER BY a.is_default DESC, a.created_at DESC
  LIMIT 1;

  -- Get order history
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'order_id', COALESCE(o.external_order_id, 'ORD-' || LEFT(o.id::text, 8)),
        'total_amount', o.total_amount,
        'order_status', COALESCE(o.status, 'pending'),
        'order_date', o.created_at
      )
      ORDER BY o.created_at DESC
    ),
    '[]'::jsonb
  ),
  COALESCE(COUNT(o.id), 0),
  COALESCE(SUM(o.total_amount), 0)
  INTO orders_payload, order_count, total_spent
  FROM public.orders o
  WHERE o.user_id = p_user_id;

  RETURN jsonb_build_object(
    'external_customer_id', p.id,
    'first_name', COALESCE(p.first_name, ''),
    'last_name', COALESCE(p.last_name, ''),
    'email', p.email,
    'phone', p.phone,
    'default_address', default_address_payload,
    'all_addresses', addresses_payload,
    'order_history', orders_payload,
    'total_orders', order_count,
    'total_spent', total_spent
  );
END;
$$;
;
