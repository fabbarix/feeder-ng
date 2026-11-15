-- Users: when they first signed in (beta.9, B9-52, SET-03). Additive only.
-- signed_in_at: the instant the first session was started for the User (Google or dev sign-in); NULL until then. The
-- Allowlist shows a signed-in User's display name and "Not signed in yet" for the others. Ending a session keeps it.
ALTER TABLE users ADD COLUMN signed_in_at TEXT;
-- Backfill from every record only a signed-in User can have written (sessions are deleted on sign-out and expiry, so they
-- alone miss Users who signed in long ago): a session, a push subscription, a Leftover event, a Cooked or Not cooked mark, a
-- Not needed or a tick on the Shopping List, a Recipe Assistant or access audit event they made. The earliest one wins.
-- Saved preferences prove a sign-in but carry no time: the User's created_at stands in. A User with none of these stays NULL.
UPDATE users SET signed_in_at = (SELECT MIN(t) FROM (
    SELECT created_at AS t FROM sessions WHERE user_id = users.id
    UNION ALL SELECT created_at FROM push_subscriptions WHERE user_id = users.id
    UNION ALL SELECT created_at FROM leftover_events WHERE user_id = users.id
    UNION ALL SELECT marked_at FROM cooked_takes WHERE user_id = users.id AND marked_at IS NOT NULL
    UNION ALL SELECT created_at FROM shopping_not_needed WHERE user_id = users.id
    UNION ALL SELECT ticked_at FROM shopping_tick_additions WHERE user_id = users.id
    UNION ALL SELECT at FROM recipe_assistant_events WHERE actor_user_id = users.id
    UNION ALL SELECT at FROM access_events WHERE actor_user_id = users.id
    UNION ALL SELECT users.created_at FROM user_preferences WHERE user_id = users.id
));
