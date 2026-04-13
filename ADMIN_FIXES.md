# Admin Section — Full Fix Log

This document records all fixes applied to the Admin section across the frontend (mobile) and backend (party-admin-backend).

---

## Session 1 Fixes (party-admin-backend + mobile)

### 1. Admin Profile Auto-Sync on Boot
- **File**: `mobile/src/context/AuthContext.tsx`
- **Fix**: On boot, if `role === 'admin'`, silently prefetches `GET /admin/profile` after 500ms and merges the latest `name` and `profileImage` into app state.

### 2. Admin Profile Endpoint
- **Files**: `src/routes/admin.routes.js`, `src/controllers/admin.controller.js`
- **Fix**: Added `GET /admin/profile` route + `getAdminProfile` controller with 5-minute Redis cache.

### 3. Keyboard Avoiding in Admin Settings Modal
- **File**: `mobile/src/app/admin/settings.tsx`
- **Fix**: Wrapped modal with `KeyboardAvoidingView`. Fixed `TextInput` color prop to use inline object style `{ color: '#FFFFFF' }` instead of invalid string.

---

## Session 2 Fixes (Current Session)

### 4. `app.json` — Invalid `usesCleartextTraffic` Property
- **File**: `mobile/app.json`
- **Fix**: Removed `"usesCleartextTraffic": true` from the top-level `android` config block. This property is not a valid Expo manifest field and was causing a lint warning. It remains correctly configured in the `expo-build-properties` plugin.

### 5. Bookings Screen — Chip Filters Reduced to 3
- **File**: `mobile/src/app/admin/bookings.tsx`
- **Fix**: Removed the `Approved` chip from `STATUS_FILTERS`. Admin now sees only: **All**, **Pending**, **Active**, **Checked In**. All chips are fully functional and filter the API response via `?status=` query param.

### 6. Dashboard — Analytics Link Was Dead (`'#'`)
- **File**: `mobile/src/app/admin/dashboard.tsx`
- **Fix**: Changed the "Advanced Analytics" tool card path from `'#'` to `'/admin/analytics'`. Changed color from `textDim` to `#06b6d4` (cyan) so it visually indicates it is tappable.

### 7. Analytics Screen — Top Spenders & Top Items Never Rendered
- **File**: `mobile/src/app/admin/analytics.tsx`
- **Fix**: The `topUsers` and `topItems` data was fetched via `useQuery` but the JSX sections were missing. Added:
  - **Top Spenders** card — shows top 10 users by total spend with avatar, rank badge, and formatted amount.
  - **Top Menu Items** card — shows top 10 food items by revenue (host-only, hidden for admin role).

### 9. Booking Model — Incorrect Host Population
- **File**: `party-admin-backend/src/models/booking.model.js`
- **Fix**: Changed `hostId` reference from `'User'` to `'Host'`. Previously, the dashboard displayed "by Partner Host" as a fallback because `populate('hostId')` returned null due to targeting the wrong collection.

### 10. Bookings API & UI Redesign
- **Files**: `src/controllers/admin.controller.js`, `mobile/src/app/admin/bookings.tsx`, `mobile/src/services/adminService.ts`
- **Fix**: 
  - Added `phone` and `ticketType` to the backend projection/population for the booking list.
  - Completely redesigned the mobile Bookings screen:
    - Smart identifier display (shows email, falls back to phone, then ID).
    - True host venue names displayed.
    - Premium card UI with ticket type, guest count, proper badges for payment status.

---

## Architecture Notes

| Endpoint | Admin Behaviour | Host Behaviour |
|---|---|---|
| `GET /analytics/summary` | All bookings + tickets | Own bookings + orders + staff |
| `GET /analytics/revenue-trend` | All revenue from Apr 1 | Own revenue from Apr 1 |
| `GET /analytics/top-users` | ✅ All platform spenders | Own customers only |
| `GET /analytics/top-items` | ✅ All platform items | Own menu items only |
| `GET /analytics/booking-trend` | All bookings from Apr 1 | Own bookings from Apr 1 |

### 11. Production Core & Store Submission Compliance
- **File**: `mobile/app.json`
- **Fix**: 
  - Submitting to the App Store requires a registered `bundleIdentifier` — added `com.entryclub.app` to iOS config.
  - Submitting to Google Play Store flags cleartext security warnings — absolutely removed the `expo-build-properties` plugin that was injecting `usesCleartextTraffic: true`, because both staging and production API endpoints are `HTTPS`.
  - Initialized `versionCode` (Android) and `buildNumber` (iOS) natively, enabling proper EAS automated build versioning and release tracking.

---

## Production Checklist Before APK/App Store Build

- [ ] Switch `TWILIO_BYPASS=false` in the Render environment variables for authentic SMS OTPs
- [ ] Ensure `NODE_ENV=production` on both backend microservices (User + Admin)
- [ ] Set strict, rotated cryptos for `JWT_SECRET` and `JWT_REFRESH_SECRET`
- [ ] Update `ALLOWED_ORIGINS` CORS domains if deploying the web portal
- [ ] Switch Razorpay from `rzp_test_*` to live production keys via Env
- [ ] Run **Android Build**: `eas build --platform android --profile production`
- [ ] Run **iOS Build**: `eas build --platform ios --profile production`

---

*Last updated: April 2026*
