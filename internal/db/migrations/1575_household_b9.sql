-- Household settings for beta.9 (B9-12). Additive only.
-- earliest_start: the Household's Earliest start (PC-14, decision PC 5), the earliest "HH:MM" the planner may ask
-- someone to start cooking, in the household zone. NULL is Off. The Household already there gets '06:30', the same as
-- a new one, so its next replan may move a long Recipe off an early slot (upgrade notes).
ALTER TABLE household_settings ADD COLUMN earliest_start TEXT DEFAULT '06:30';
-- setup_hidden: 1 when the first-run checklist on Today is hidden (TB-06) until it is shown again.
ALTER TABLE household_settings ADD COLUMN setup_hidden INTEGER NOT NULL DEFAULT 0 CHECK (setup_hidden IN (0, 1));
