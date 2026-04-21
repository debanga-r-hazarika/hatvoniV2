export const VELOCITY_ACTIONS = [
  'create_warehouse',
  'check_serviceability',
  'calculate_rates',
  'create_order',
  'create_forward_order',
  'assign_courier',
  'cancel_order',
  'cancel_velocity_draft',
  'track_order',
  'get_reports',
  'list_shipments',
  'list_returns',
  'initiate_return',
  'assign_return_courier',
  'resume_existing_shipping',
  'reinitiate_shipping',
  'webhook_update',
  'webhook_health',
] as const;

export type VelocityAction = (typeof VELOCITY_ACTIONS)[number];

export interface ActionRequest {
  action: VelocityAction;
  payload?: Record<string, unknown>;
}

const ACTION_SET = new Set<string>(VELOCITY_ACTIONS);

export function parseActionRequest(input: unknown): ActionRequest {
  if (!input || typeof input !== 'object') {
    throw new Error('Request body must be a JSON object.');
  }

  const raw = input as Record<string, unknown>;
  if (typeof raw.action !== 'string' || !ACTION_SET.has(raw.action)) {
    throw new Error(`Unsupported action. Allowed actions: ${VELOCITY_ACTIONS.join(', ')}`);
  }

  if (raw.payload !== undefined && (typeof raw.payload !== 'object' || raw.payload === null || Array.isArray(raw.payload))) {
    throw new Error('payload must be a JSON object when provided.');
  }

  return {
    action: raw.action as VelocityAction,
    payload: (raw.payload as Record<string, unknown> | undefined) || {},
  };
}

export function validatePayloadForAction(action: VelocityAction, payload: Record<string, unknown>): string | null {
  const hasString = (k: string) => typeof payload[k] === 'string' && String(payload[k]).trim().length > 0;

  switch (action) {
    case 'create_warehouse':
      if (!hasString('seller_id')) return 'create_warehouse requires payload.seller_id';
      if (!hasString('pickup_location_id')) return 'create_warehouse requires payload.pickup_location_id';
      return null;
    case 'check_serviceability':
      if (!hasString('order_id') && !(hasString('from') && hasString('to'))) {
        return 'check_serviceability requires payload.order_id or payload.from + payload.to';
      }
      return null;
    case 'calculate_rates':
      if (!(hasString('pickup_pincode') && hasString('delivery_pincode'))) {
        return 'calculate_rates requires payload.pickup_pincode and payload.delivery_pincode';
      }
      return null;
    case 'create_order':
      if (!hasString('order_id')) return 'create_order requires payload.order_id';
      return null;
    case 'create_forward_order': {
      if (!hasString('order_id')) return 'create_forward_order requires payload.order_id';
      if (!hasString('pickup_location_id')) {
        return 'create_forward_order requires payload.pickup_location_id (synced seller pickup location)';
      }
      const dims = ['length', 'breadth', 'height', 'weight'] as const;
      for (const k of dims) {
        const n = Number(payload[k]);
        if (!Number.isFinite(n) || n <= 0) {
          return `create_forward_order requires a positive number for payload.${k} (cm / kg per Velocity API)`;
        }
      }
      return null;
    }
    case 'assign_courier':
      if (!hasString('order_id')) return 'assign_courier requires payload.order_id';
      return null;
    case 'cancel_order':
      if (!hasString('order_id')) return 'cancel_order requires payload.order_id';
      return null;
    case 'cancel_velocity_draft':
      if (!hasString('order_id')) return 'cancel_velocity_draft requires payload.order_id';
      return null;
    case 'track_order':
      if (!(hasString('order_id') || hasString('awb') || hasString('tracking_number') || hasString('shipment_id'))) {
        return 'track_order requires payload.order_id, payload.awb, payload.tracking_number, or payload.shipment_id';
      }
      return null;
    case 'get_reports':
    case 'list_shipments':
    case 'list_returns':
    case 'initiate_return':
    case 'assign_return_courier':
    case 'resume_existing_shipping':
      if (!hasString('order_id')) return 'resume_existing_shipping requires payload.order_id';
      if (!hasString('shipment_id')) return 'resume_existing_shipping requires payload.shipment_id';
      return null;
    case 'reinitiate_shipping':
      if (!hasString('order_id')) return 'reinitiate_shipping requires payload.order_id';
      return null;
    case 'webhook_update':
    case 'webhook_health':
      return null;
    default:
      return 'Invalid action payload';
  }
}
