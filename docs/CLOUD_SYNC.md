# Cloud sync (Supabase + Google)

Local-first with write-behind sync. The app always reads/writes AsyncStorage
instantly (UI never waits on the network); changes are pushed to Supabase in the
background (debounced ~2s). On sign-in / launch it merges local ↔ cloud with
last-write-wins on `AppData.updatedAt`.

Everything is gated on `authReady` (`supabaseReady && EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`).
With no keys the app runs exactly as before, fully local — the sync card is hidden.

## Data flow

- `src/lib/supabase.ts` — client + `supabaseReady`.
- `src/lib/auth.ts` — Google sign-in → `supabase.auth.signInWithIdToken`.
- `src/lib/cloudState.ts` — `pull`/`push` one JSON blob per user (`public.user_state`).
- `src/lib/sync.ts` — `queuePush` (debounced write-behind), `flushPush`, `reconcile` (LWW).
- `src/AppContext.tsx` — stamps `updatedAt` on user actions, pushes behind saves,
  reconciles when a session appears.
- `src/components/SyncCard.tsx` — sign in / account / status (in the Bộ sưu tập tab).

## One-time setup

### 1. Supabase
1. Create a project at supabase.com.
2. SQL Editor → run `supabase/schema.sql` (creates `user_state` + RLS).
3. Authentication → Providers → enable **Google**, paste the Google **Web client
   ID + secret** (from step 2 below).
4. Project Settings → API → copy the URL + anon key into `.env`:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR-REF.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```

### 2. Google OAuth (Google Cloud Console → Credentials)
1. Create an **OAuth client ID → Web application**. Add Supabase's callback
   (`https://YOUR-REF.supabase.co/auth/v1/callback`) as an authorized redirect URI.
   This Web client ID goes into `.env` and into Supabase's Google provider:
   ```
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com
   ```
2. Create an **OAuth client ID → iOS** (bundle id `com.anonymous.pokemon-habit`).
   Take its **reversed** client id and put it in `app.json` under the
   google-signin plugin `iosUrlScheme`:
   ```
   com.googleusercontent.apps.xxxx   ← reversed iOS client id
   ```
   (Android: create an Android OAuth client with the package + SHA-1; no extra
   app.json field needed.)

### 3. Rebuild
`@react-native-google-signin/google-signin` is a native module, so a new dev/prod
build is required after adding it:
```
npx expo prebuild --clean
npx expo run:ios   # or run:android
```

The GoogleSignIn iOS SDK pulls in `AppCheckCore`, which needs module maps to link
as a static library. `app.json` already handles this via `expo-build-properties`
(`ios.extraPods` marks `GoogleUtilities` + `RecaptchaInterop` as `modular_headers`),
so `pod install` works out of the box.

## Notes
- Model is one JSON blob per user, LWW by `updatedAt` — simple and fine for a
  single user across devices; it does not merge concurrent edits field-by-field.
- Sign-out keeps local data; signing back in re-syncs.
