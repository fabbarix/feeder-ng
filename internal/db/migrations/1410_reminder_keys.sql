-- 1410 (team G1, docs/dev/design/crs-plan.md 1.5): push_sent keys of Advance Step reminders gain the Course.
-- '<type>:<date>/<slot>/<step>@<due>' becomes '<type>:<date>/<slot>/<course>/<step>@<due>', so a reminder sent
-- before the upgrade is not sent again. Only advanceStep rows are rewritten; Start cooking, Confirm Cooked and
-- the other types keep their keys. MAIN is the id of the main Course (the flag, never a literal id).
-- Idempotent: a rewritten key has three '/' before '@', so the guard skips it on a second run.
-- k = 'advanceStep:' + date(10) + '/' + slot + '/' + step; p = position of the '/' after the slot id.
UPDATE push_sent
   SET key = substr(key, 1, 22 + instr(substr(key, 24), '/'))
          || '/' || (SELECT id FROM courses WHERE is_main = 1)
          || substr(key, 23 + instr(substr(key, 24), '/'))
 WHERE substr(key, 1, 12) = 'advanceStep:'
   AND length(key) - length(replace(key, '/', '')) = 2
   AND EXISTS (SELECT 1 FROM courses WHERE is_main = 1);
