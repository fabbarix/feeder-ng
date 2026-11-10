-- A1 phase 2: the optional Member email (case-insensitive, unique).
ALTER TABLE members ADD COLUMN email TEXT COLLATE NOCASE;
CREATE UNIQUE INDEX members_email ON members (email) WHERE email IS NOT NULL;
