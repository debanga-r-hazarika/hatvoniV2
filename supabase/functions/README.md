# Hatvoni Insider Integration (Customer Site)

This Customer Site Supabase project exposes and uses three edge functions:

- `sync-customer-to-insider`
  - Triggered on user registration and profile updates.
  - Syncs customer profile data to Insider's Online Customers section.
  - Called by: `Signup.jsx` (after successful signup), `Profile.jsx` (after profile updates)

- `forward-order-to-insider`
  - Triggered after checkout confirmation.
  - Forwards confirmed order data to Insider edge function `ingest-order-from-customer-site`.

- `insider-order-sync`
  - Secure inbound endpoint used as `CUSTOMER_SITE_ORDER_SYNC_URL` by Insider.
  - Applies lifecycle updates with HMAC verification + version gating.

- `create-razorpay-order`
  - Authenticated endpoint to create a Razorpay order for an existing local order.
  - Validates ownership and stores `razorpay_order_id` + payment initiation metadata.

- `verify-razorpay-payment`
  - Authenticated endpoint called from checkout after Razorpay popup success.
  - Verifies Razorpay signature server-side and marks order as paid.

- `razorpay-webhook`
  - Public inbound endpoint for Razorpay webhook retries and eventual consistency.
  - Verifies `x-razorpay-signature`, deduplicates events, and reconciles payment status.

- `create-phonepe-order`
  - Authenticated endpoint to initialize a PhonePe payment for an existing local order.
  - Validates ownership, generates `merchantTransactionId`, and returns PhonePe redirect URL.

- `verify-phonepe-payment`
  - Authenticated endpoint to fetch PhonePe payment status for an order.
  - Reconciles local `orders.payment_status` as `paid`, `failed`, or pending.

- `phonepe-webhook`
  - Public callback endpoint dedicated to PhonePe webhook notifications.
  - Reconciles payment state by merchant transaction id and updates the linked local order.

## Function URLs

  - `https://dhtwkfethmqcgpqdbksi.supabase.co/functions/v1/insider-order-sync`
- `create-razorpay-order`
  - `https://dhtwkfethmqcgpqdbksi.supabase.co/functions/v1/create-razorpay-order`
- `verify-razorpay-payment`
  - `https://dhtwkfethmqcgpqdbksi.supabase.co/functions/v1/verify-razorpay-payment`
- `razorpay-webhook`
  - `https://dhtwkfethmqcgpqdbksi.supabase.co/functions/v1/razorpay-webhook`
- `create-phonepe-order`
  - `https://dhtwkfethmqcgpqdbksi.supabase.co/functions/v1/create-phonepe-order`
- `verify-phonepe-payment`
  - `https://dhtwkfethmqcgpqdbksi.supabase.co/functions/v1/verify-phonepe-payment`
- `phonepe-webhook`
  - `https://dhtwkfethmqcgpqdbksi.supabase.co/functions/v1/phonepe-webhook`

## Required Secrets (Customer Site Supabase Edge Function secrets)

Set these in the Customer Site Supabase project:

- `RAZORPAY_KEY_ID`
  - Razorpay Key ID used by backend and sent to checkout session
- `RAZORPAY_KEY_SECRET`
  - Razorpay Key Secret used to create orders and verify signatures
- `RAZORPAY_WEBHOOK_SECRET`
  - Razorpay webhook signing secret (must match dashboard webhook config)
- `PHONEPE_MERCHANT_ID`
  - PhonePe merchant ID (for dashboard/webhook context)
- `PHONEPE_CLIENT_ID`
  - PhonePe client ID for OAuth token generation
- `PHONEPE_CLIENT_SECRET`
  - PhonePe client secret for OAuth token generation
- `PHONEPE_CLIENT_VERSION`
  - PhonePe client version for OAuth token generation
- `PHONEPE_WEBHOOK_USERNAME`
  - Username configured in PhonePe dashboard webhook settings
- `PHONEPE_WEBHOOK_PASSWORD`
  - Password configured in PhonePe dashboard webhook settings

Optional PhonePe secrets:

- `PHONEPE_ENV`
  - `sandbox` or `production` (defaults to `production`)
- `PHONEPE_API_BASE_URL`
  - Override API base URL for checkout/status APIs
- `APP_BASE_URL`
  - Public storefront URL used to build payment redirect return path
- `PHONEPE_CALLBACK_URL`
  - Explicit callback URL for payment create request metadata
- `PHONEPE_EXPIRE_AFTER`
  - Optional checkout expiry in seconds, default `1200`

## Cloudflare R2 Setup (Project-wide File/Object Storage)

Use Cloudflare R2 as your common object store for webhook archives, exports, logs, and generated files.

Required secrets for Supabase Edge Functions:

- `R2_ACCOUNT_ID`
  - Cloudflare account ID (from dashboard URL/API settings)
- `R2_BUCKET`
  - R2 bucket name you created for this project
- `R2_ACCESS_KEY_ID`
  - R2 API token access key id
- `R2_SECRET_ACCESS_KEY`
  - R2 API token secret access key

Optional:

- `R2_PUBLIC_BASE_URL`
  - Public domain/base URL for direct object links (for example your custom domain or R2.dev public URL)
- `R2_UPLOAD_REQUIRE_AUTH`
  - `true` (default) requires logged-in user token for uploads; set `false` only if you want public uploads
- `R2_UPLOAD_MAX_BYTES`
  - Max upload size in bytes for `upload-to-r2` function (default `26214400`, i.e. 25MB)

Create bucket and API token in Cloudflare:

1. Cloudflare Dashboard -> R2 -> Create bucket (example: `customer-site-prod`)
2. R2 -> Manage R2 API tokens -> Create API token (Object Read & Write for your bucket)
3. Copy `Access Key ID` and `Secret Access Key`

Set the secrets in Supabase Edge:

```bash
supabase secrets set \
  R2_ACCOUNT_ID=your_account_id \
  R2_BUCKET=customer-site-prod \
  R2_ACCESS_KEY_ID=your_access_key_id \
  R2_SECRET_ACCESS_KEY=your_secret_access_key \
  R2_PUBLIC_BASE_URL=https://files.example.com
```

R2 helper available to all functions:

- Shared module: `supabase/functions/_shared/r2.ts`
- Reusable APIs:
  - `isR2Configured()`
  - `buildR2ObjectKey(prefix, extension?)`
  - `uploadJsonToR2(key, payload, metadata?)`

Current live usage:

- `send-whatsapp` now archives full webhook payloads to R2 path prefix `whatsapp/webhooks/`
- It still succeeds if R2 upload fails (fail-safe webhook behavior)
- `upload-to-r2` accepts `multipart/form-data` and stores incoming files/photos directly into R2

### Upload files/photos directly from website

Deploy function:

```bash
supabase functions deploy upload-to-r2
```

Frontend helper:

- `src/services/r2UploadService.js`
- `uploadFileToR2(file, { folder, filename })`

Expected frontend env vars:

- `VITE_R2_UPLOAD_FUNCTION=upload-to-r2` (optional, defaults to this value)
- `VITE_R2_PUBLIC_BASE_URL=https://files.example.com` (optional but recommended)

Example usage:

```js
import { uploadFileToR2 } from '../services/r2UploadService';

const file = input.files[0];
const uploaded = await uploadFileToR2(file, { folder: 'products/images' });
// Save uploaded.key in DB, use uploaded.url when you need to render/download it.
```

## Razorpay Checkout Flow

1. Checkout creates local order with `payment_method = 'razorpay_upi'` or `payment_method = 'razorpay_cards'` (legacy `'razorpay'` remains supported)
2. Frontend invokes `create-razorpay-order`
3. Razorpay popup returns `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`
4. Frontend invokes `verify-razorpay-payment`
5. Server verifies HMAC and marks `orders.payment_status = 'paid'`
6. Paid orders are forwarded to Insider via `forward-order-to-insider`

Supported Razorpay payment methods:

- `razorpay_upi`: UPI-first checkout option
- `razorpay_cards`: cards/netbanking/wallet/EMI checkout option
- `razorpay`: legacy online mode for backward compatibility

## Razorpay Webhook Setup

Recommended events:

- `payment.captured`
- `payment.failed`
- `order.paid`
- `refund.processed`

Endpoint:

- `POST https://<CUSTOMER_SITE_PROJECT>.supabase.co/functions/v1/razorpay-webhook`

Headers sent by Razorpay:

- `x-razorpay-signature`
- `x-razorpay-event-id` (when present)

Webhook behavior:

- Signature is validated against `RAZORPAY_WEBHOOK_SECRET`
- Events are deduplicated in `public.razorpay_webhook_events`
- `orders.payment_status` is reconciled to `paid`, `failed`, or `refunded`

## Inbound Signature Contract (`insider-order-sync`)

Insider must send:

- Header `X-Insider-Timestamp`: unix epoch in milliseconds
- Header `X-Insider-Signature`: lowercase hex HMAC SHA-256

Signature input string:

- `${timestamp}.${rawJsonBody}`

Algorithm:

- HMAC SHA-256 using secret `INSIDER_SYNC_SHARED_SECRET`

## Version Gating

Order projection updates are applied only when:

- `payload.version > orders.last_received_version`

Otherwise the sync is accepted as stale and ignored (`applied: false`).

## Payload Examples

### 1) Customer Site -> Insider (sync-customer-to-insider)

Endpoint:

- `POST https://<INSIDER_PROJECT>.supabase.co/functions/v1/ingest-online-customer`

Required header:

- `Authorization: Bearer <INSIDER_CUSTOMER_SYNC_SECRET>`

Example JSON body:

```json
{
  "external_customer_id": "2672406c-8f87-4db7-8967-8bcc03c3de9f",
  "name": "Deban Baruah",
  "phone": "+91-9876543210",
  "address": "123 Main St, Guwahati, Assam 781001",
  "email": "deban@example.com",
  "customer_type": "online"
}
```

Notes:

- Called on user registration (Signup.jsx) and profile updates (Profile.jsx)
- `external_customer_id` is the Customer Site user UUID
- Triggered automatically, no manual invocation needed
- Failures are logged to `customer_sync_failures` table but don't block signup/profile update

### 2) Customer Site -> Insider (ingest-order-from-customer-site)

Endpoint:

- `POST https://<INSIDER_PROJECT>.supabase.co/functions/v1/ingest-order-from-customer-site`

Required header:

- `x-customer-site-ingest-secret: <INSIDER_INGEST_SECRET>`

Example JSON body:

```json
{
  "external_order_id": "8d75eb99-bc73-4cab-8af9-ec4ec26c496a",
  "external_customer_id": "2672406c-8f87-4db7-8967-8bcc03c3de9f",
  "version": 1,
  "status": "placed",
  "order_date": "2026-03-31",
  "order_number": "HAT-8D75EB99",
  "notes": null,
  "items": [
    {
      "external_product_id": "f6a31de0-7da2-4fbb-8e95-8d917b6f4f82",
      "product_name": "Big Bamboo",
      "product_type": "khar",
      "quantity": 2,
      "unit_price": 450,
      "unit": "unit"
    },
    {
      "external_product_id": "52db0876-8f6a-4f3b-ab35-df75f6d4e8ba",
      "product_name": "Sticky Rice",
      "product_type": "rice",
      "quantity": 1,
      "unit_price": 840,
      "unit": "unit"
    }
  ]
}
```

### 3) Insider -> Customer Site (insider-order-sync)

Endpoint:

- `POST https://dhtwkfethmqcgpqdbksi.supabase.co/functions/v1/insider-order-sync`

Required headers:

- `X-Insider-Timestamp: <unix_epoch_ms>`
- `X-Insider-Signature: <hmac_sha256_hex_of_timestamp_dot_raw_body>`

Example JSON body:

```json
{
  "contract_version": 1,
  "external_order_id": "8d75eb99-bc73-4cab-8af9-ec4ec26c496a",
  "external_customer_id": "2672406c-8f87-4db7-8967-8bcc03c3de9f",
  "version": 3,
  "order_status": "shipped",
  "notes": "Packed and dispatched from Guwahati hub",
  "processed_at": "2026-03-31T10:30:00Z",
  "shipping": {
    "provider": "Delhivery",
    "tracking_number": "DLV123456789IN",
    "shipment_status": "in_transit",
    "shipped_at": "2026-03-31T12:15:00Z",
    "transport_cost": 79,
    "transport_covered_by": "customer"
  }
}
```

Notes:

- `version` must increase on every Insider update for the same `external_order_id`.
- Duplicate or older versions are accepted but ignored (`applied: false`).
