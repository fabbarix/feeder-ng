-- A1 phase 1: Access Requests, their audit trail, and the accessRequest push type.
-- (members.email is phase 2, migration 1210_member_email.sql, with the household changes.)
CREATE TABLE access_requests (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    email        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name         TEXT NOT NULL,
    picture      TEXT NOT NULL DEFAULT '',
    token_hash   TEXT NOT NULL UNIQUE,
    requested_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at   TEXT NOT NULL
);
CREATE INDEX access_requests_expires ON access_requests (expires_at);

CREATE TABLE access_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    at            TEXT NOT NULL,
    kind          TEXT NOT NULL CHECK (kind IN ('requested', 'approved', 'denied', 'expired')),
    email         TEXT NOT NULL COLLATE NOCASE,
    name          TEXT NOT NULL DEFAULT '',
    actor_user_id INTEGER,                    -- deliberately no foreign key: the audit trail outlives the User
    actor_email   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX access_events_email ON access_events (email, kind, at);

-- Widen the CHECK on push_subscription_types (SQLite cannot alter it): rebuild the child table.
CREATE TABLE push_subscription_types_new (
    subscription_id INTEGER NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
    type            TEXT    NOT NULL CHECK (type IN
        ('advanceStep', 'startCooking', 'confirmCooked', 'leftoverUseBy', 'stockSpoil', 'timerFinished', 'accessRequest')),
    PRIMARY KEY (subscription_id, type)
);
INSERT INTO push_subscription_types_new SELECT subscription_id, type FROM push_subscription_types;
DROP TABLE push_subscription_types;
ALTER TABLE push_subscription_types_new RENAME TO push_subscription_types;
