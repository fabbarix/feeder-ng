-- Web Push: one row per browser/device subscription, per-type opt-in, and a
-- log of what was already sent so each notification goes out once.
CREATE TABLE push_subscriptions (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT    NOT NULL UNIQUE,
    p256dh     TEXT    NOT NULL,
    auth       TEXT    NOT NULL,
    label      TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL
);
CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);

CREATE TABLE push_subscription_types (
    subscription_id INTEGER NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
    type            TEXT    NOT NULL CHECK (type IN
        ('advanceStep', 'startCooking', 'confirmCooked', 'leftoverUseBy', 'stockSpoil', 'timerFinished')),
    PRIMARY KEY (subscription_id, type)
);

CREATE TABLE push_sent (
    subscription_id INTEGER NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
    key             TEXT    NOT NULL,
    sent_at         TEXT    NOT NULL,
    PRIMARY KEY (subscription_id, key)
);
CREATE INDEX push_sent_at ON push_sent (sent_at);
