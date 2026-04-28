# Push Notification Setup (Desktop + Mobile Web)

This project now supports browser push subscription + live notification display.

## Already implemented

- Service worker: `public/sw-notifications.js`
- Subscription manager: `src/services/webPushService.js`
- Realtime notification -> local browser notification in `AdminNotificationsMenu`
- DB table for subscriptions: `public.push_subscriptions`

## Required env setup

Add VAPID public key to frontend environment:

- `VITE_WEB_PUSH_PUBLIC_KEY=<your_public_vapid_key>`

Without this key, subscription setup is skipped safely.

## Backend send step (recommended next)

To deliver true background push when app is closed, add a sender job/function that:

1. Reads recipients from `admin_notifications`
2. Looks up `push_subscriptions`
3. Sends Web Push payload using VAPID private key

This repo is now ready for that final sender integration.
