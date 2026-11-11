-- Recipe Assistant (ai-recipe-import.md §8): one settings row, seeded off, and its change history.
-- The API key is stored only as AES-256-GCM ciphertext (internal/secretbox); api_key_master_id says which
-- FEEDER_SECRET_KEY sealed it, api_key_last4 is the only part ever shown.
CREATE TABLE recipe_assistant_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  base_url TEXT NOT NULL DEFAULT 'https://api.anthropic.com',
  model TEXT NOT NULL DEFAULT 'claude-haiku-5-5',
  api_key_ciphertext BLOB,
  api_key_last4 TEXT,
  api_key_master_id TEXT,
  updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  updated_by INTEGER NOT NULL DEFAULT 0
);
INSERT INTO recipe_assistant_settings (id) VALUES (1);

-- No foreign key on the actor: the row is a snapshot that outlives the User.
CREATE TABLE recipe_assistant_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX recipe_assistant_events_at ON recipe_assistant_events(at);
