-- T1: the Household (settings, Members, Meal Slots, Attendance) and per-User preferences.
CREATE TABLE household_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  time_zone TEXT NOT NULL DEFAULT 'UTC', time_zone_configured INTEGER NOT NULL DEFAULT 0,
  planning_horizon_days INTEGER NOT NULL DEFAULT 7, default_cooldown_days INTEGER NOT NULL DEFAULT 7,
  default_leftover_use_by_days INTEGER NOT NULL DEFAULT 3,
  quiet_hours_start TEXT NOT NULL DEFAULT '22:00', quiet_hours_end TEXT NOT NULL DEFAULT '07:00',
  planner_style REAL NOT NULL DEFAULT 0.5 CHECK (planner_style BETWEEN 0 AND 1),
  location_city TEXT, location_latitude REAL, location_longitude REAL,
  currency TEXT NOT NULL DEFAULT 'USD');
INSERT INTO household_settings (id) VALUES (1);
CREATE TABLE members (id INTEGER PRIMARY KEY, name TEXT NOT NULL, colour TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '',
  portion_factor REAL NOT NULL, user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL);
CREATE TABLE meal_slots (id INTEGER PRIMARY KEY, weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  name TEXT NOT NULL COLLATE NOCASE, time TEXT NOT NULL, UNIQUE (weekday, name));
CREATE TABLE meal_slot_attendees (slot_id INTEGER NOT NULL REFERENCES meal_slots(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE, portion_factor_override REAL,
  PRIMARY KEY (slot_id, member_id));
CREATE TABLE attendance_overrides (slot_id INTEGER NOT NULL REFERENCES meal_slots(id) ON DELETE CASCADE,
  date TEXT NOT NULL, PRIMARY KEY (slot_id, date));
CREATE TABLE attendance_override_attendees (slot_id INTEGER NOT NULL, date TEXT NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE, portion_factor_override REAL,
  PRIMARY KEY (slot_id, date, member_id),
  FOREIGN KEY (slot_id, date) REFERENCES attendance_overrides(slot_id, date) ON DELETE CASCADE);
CREATE TABLE user_preferences (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  scheme TEXT NOT NULL DEFAULT 'system', accent TEXT NOT NULL DEFAULT '#3f7d58', secondary TEXT,
  units TEXT NOT NULL DEFAULT 'metric');
