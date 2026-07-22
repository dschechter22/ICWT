# ICWT Fantasy Chatroom

Cloned from the FantasyChatroom template. This copy has no data yet --
see `supabase/schema.sql` and the setup steps below to stand up your own
Supabase project and start entering ICWT's managers and league history.

## Setup

1. Create a new Supabase project.
2. In the Supabase SQL Editor, run `supabase/schema.sql` in full.
3. Copy `.env.local.example` to `.env.local` and fill in your Supabase URL/anon key.
4. `npm install && npm run dev`.
5. Add managers, seasons, teams, and matchups (via Supabase's Table Editor, or
   build them out through the app's own admin flows where available).
