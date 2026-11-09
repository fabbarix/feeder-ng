-- T0: users (the allowlist: a row means the person may sign in) and sessions.
CREATE TABLE users (
    id           INTEGER PRIMARY KEY,
    email        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT    NOT NULL,
    is_admin     INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
    created_at   TEXT    NOT NULL
);

CREATE TABLE sessions (
    id         INTEGER PRIMARY KEY,
    token_hash TEXT    NOT NULL UNIQUE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL,
    expires_at TEXT    NOT NULL,
    last_seen  TEXT    NOT NULL
);

CREATE INDEX sessions_user_id ON sessions(user_id);
