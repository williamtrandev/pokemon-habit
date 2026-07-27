# Cloud sync (Supabase, anonymous)

Local-first with write-behind sync. The app always reads/writes AsyncStorage
instantly (UI never waits on the network); changes are pushed to Supabase in the
background (debounced ~2s). On launch it merges local ↔ cloud with last-write-wins
on `AppData.updatedAt`.

No login: the app signs in **anonymously** (`supabase.auth.signInAnonymously()`),
so each install gets a persistent uuid and RLS still isolates data. Everything is
gated on `authReady` (`supabaseReady` = URL + anon key present). With no keys the
app runs fully local — the sync card is hidden.

## Data flow

- `src/lib/supabase.ts` — client + `supabaseReady`.
- `src/lib/auth.ts` — Google sign-in → `supabase.auth.signInWithIdToken`.
- `src/lib/cloudState.ts` — `pull`/`push` one JSON blob per user (`public.user_state`).
- `src/lib/sync.ts` — `queuePush` (debounced write-behind), `flushPush`, `reconcile` (LWW).
- `src/AppContext.tsx` — stamps `updatedAt` on user actions, pushes behind saves,
  reconciles when a session appears.
- `src/components/SyncCard.tsx` — sync status (in the Pokédex tab). No buttons.

## One-time setup (Supabase only)

1. Create a project at supabase.com.
2. SQL Editor → run `supabase/schema.sql` (creates `user_state` + RLS).
3. Authentication → Providers → **enable Anonymous sign-ins**.
4. Project Settings → API → copy the URL + anon key into `.env`:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR-REF.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```
5. Rebuild once (`npx expo prebuild && npx expo run:ios`) so the keys are bundled.

No Google/OAuth setup, no login screen — the app creates an anonymous user
automatically on first launch.

## Notes
- Model is one JSON blob per anon user, LWW by `updatedAt`.
- The anon session lives in AsyncStorage; clearing app data / reinstalling starts a
  fresh anon user (previous cloud row is orphaned). Add real auth later if you need
  cross-device / recoverable accounts.
