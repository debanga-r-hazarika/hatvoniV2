# PhonePe Integration Handoff

This document explains what has been implemented, what you need to deploy, and what you need to configure.

## What Is Implemented

PhonePe is fully separated from Razorpay with dedicated Supabase Edge Functions:

1. `create-phonepe-order`
2. `verify-phonepe-payment`
3. `phonepe-webhook`

These functions are integrated with checkout and payment processing flows in the frontend.

## Files Added/Updated

### New / Updated Edge Functions

1. `supabase/functions/create-phonepe-order/index.ts`
2. `supabase/functions/verify-phonepe-payment/index.ts`
3. `supabase/functions/phonepe-webhook/index.ts`

### Related App Files (already wired)

1. `src/pages/Checkout.jsx`
2. `src/pages/PaymentProcessing.jsx`
3. `src/pages/Orders.jsx`
4. `src/pages/OrderDetail.jsx`
5. `src/components/admin/AdminFilters.jsx`

### Database Migration

1. `supabase/migrations/20260422113000_add_phonepe_payment_method.sql`

## What You Need To Deploy

Deploy these Edge Functions:

1. `create-phonepe-order`
2. `verify-phonepe-payment`
3. `phonepe-webhook`

Example commands:

```bash
supabase functions deploy create-phonepe-order
supabase functions deploy verify-phonepe-payment
supabase functions deploy phonepe-webhook
```

Apply DB migration:

```bash
supabase db push
```

If you use migration pipelines, apply `20260422113000_add_phonepe_payment_method.sql` through your normal release process.

## Copy-Paste Deploy Commands

Run these from project root:

```bash
supabase login
supabase link --project-ref dhtwkfethmqcgpqdbksi

supabase functions deploy create-phonepe-order
supabase functions deploy verify-phonepe-payment
supabase functions deploy phonepe-webhook

supabase db push
```

If you want to deploy to a different project, replace `dhtwkfethmqcgpqdbksi` with your project ref.

## Env Secrets You Must Set

Set these in Supabase project secrets (required):

1. `PHONEPE_CLIENT_ID`
2. `PHONEPE_CLIENT_SECRET`
3. `PHONEPE_CLIENT_VERSION`
4. `PHONEPE_WEBHOOK_USERNAME`
5. `PHONEPE_WEBHOOK_PASSWORD`

You should already have these existing Supabase function secrets too:

1. `SUPABASE_URL`
2. `SUPABASE_SERVICE_ROLE_KEY`

## Copy-Paste Secret Set Commands

Set required secrets (replace placeholder values):

```bash
supabase secrets set PHONEPE_CLIENT_ID="YOUR_PHONEPE_CLIENT_ID" --project-ref dhtwkfethmqcgpqdbksi
supabase secrets set PHONEPE_CLIENT_SECRET="YOUR_PHONEPE_CLIENT_SECRET" --project-ref dhtwkfethmqcgpqdbksi
supabase secrets set PHONEPE_CLIENT_VERSION="YOUR_PHONEPE_CLIENT_VERSION" --project-ref dhtwkfethmqcgpqdbksi
supabase secrets set PHONEPE_WEBHOOK_USERNAME="YOUR_PHONEPE_WEBHOOK_USERNAME" --project-ref dhtwkfethmqcgpqdbksi
supabase secrets set PHONEPE_WEBHOOK_PASSWORD="YOUR_PHONEPE_WEBHOOK_PASSWORD" --project-ref dhtwkfethmqcgpqdbksi
```

Set optional secrets:

```bash
supabase secrets set PHONEPE_ENV="sandbox" --project-ref dhtwkfethmqcgpqdbksi
supabase secrets set PHONEPE_EXPIRE_AFTER="1200" --project-ref dhtwkfethmqcgpqdbksi
supabase secrets set APP_BASE_URL="https://your-domain.com" --project-ref dhtwkfethmqcgpqdbksi
supabase secrets set PHONEPE_CALLBACK_URL="https://dhtwkfethmqcgpqdbksi.supabase.co/functions/v1/phonepe-webhook" --project-ref dhtwkfethmqcgpqdbksi
```

Optional API base override only if required by your PhonePe account setup:

```bash
supabase secrets set PHONEPE_API_BASE_URL="https://api-preprod.phonepe.com/apis/pg-sandbox" --project-ref dhtwkfethmqcgpqdbksi
```

If using production credentials, set:

```bash
supabase secrets set PHONEPE_ENV="production" --project-ref dhtwkfethmqcgpqdbksi
```

## Optional Env Secrets

1. `PHONEPE_ENV`
- Values: `sandbox` or `production`
- Default used by code: `production`

2. `PHONEPE_API_BASE_URL`
- Optional override for PhonePe API base URL
- Usually not required unless custom routing is needed

3. `PHONEPE_EXPIRE_AFTER`
- Checkout expiry in seconds
- Default used by code: `1200`

4. `APP_BASE_URL`
- Public storefront URL used for redirect URL creation

5. `PHONEPE_CALLBACK_URL`
- Optional callback URL value stored in metadata
- If not set, code uses the default webhook endpoint:
  - `https://<your-supabase-project>.supabase.co/functions/v1/phonepe-webhook`

## What You Need To Do In PhonePe Dashboard

1. Create/configure webhook in PhonePe dashboard
2. Webhook URL:
- `https://<your-supabase-project>.supabase.co/functions/v1/phonepe-webhook`
3. Use the same webhook username/password as:
- `PHONEPE_WEBHOOK_USERNAME`
- `PHONEPE_WEBHOOK_PASSWORD`
4. Subscribe at least to order events:
- `checkout.order.completed`
- `checkout.order.failed`

## Post-Deployment Verification Checklist

1. Place a test order using PhonePe
2. Confirm `create-phonepe-order` returns a redirect URL
3. Complete payment in PhonePe
4. Confirm webhook hits `phonepe-webhook`
5. Confirm `orders.payment_status` updates (`paid` on success, `failed` on failure)
6. Confirm payment processing page resolves correct final state
7. Confirm order appears in admin with `payment_method = phonepe`

## Recommended Release Order

1. Set secrets in Supabase
2. Deploy PhonePe functions
3. Apply DB migration
4. Configure PhonePe webhook in dashboard
5. Run sandbox/UAT test
6. Switch to production credentials and `PHONEPE_ENV=production`

## Notes

1. PhonePe and Razorpay are now independent flows.
2. PhonePe migration is aligned to OAuth-based v2 checkout/status docs.
3. Webhook is intentionally separated for easier long-term maintenance.
