-- Users: when they first signed in (beta.9, B9-52, SET-03). Additive only.
-- signed_in_at: the instant the first session was started for the User (Google or dev sign-in); NULL until then. The
-- Allowlist shows a signed-in User's display name and "Not signed in yet" for the others. Ending a session keeps it.
ALTER TABLE users ADD COLUMN signed_in_at TEXT;
-- A User who already has a session has signed in: their earliest session is the best record there is.
UPDATE users SET signed_in_at = (SELECT MIN(s.created_at) FROM sessions s WHERE s.user_id = users.id);
