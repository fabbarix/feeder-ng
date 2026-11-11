-- R13: Attendance defaults to everyone. A Meal Slot nobody attends gets every Member (no Portion
-- Factor override). Slots with attendees, per-date overrides and per-date Attendance stay as they are.
INSERT INTO meal_slot_attendees (slot_id, member_id, portion_factor_override)
SELECT s.id, m.id, NULL
FROM meal_slots s CROSS JOIN members m
WHERE NOT EXISTS (SELECT 1 FROM meal_slot_attendees a WHERE a.slot_id = s.id);
