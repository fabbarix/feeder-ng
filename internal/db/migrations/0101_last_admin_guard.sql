-- T1: the last Admin cannot be lost. A row-level trigger fires when an Admin is
-- demoted or deleted; it checks after each row, which is stricter than checking
-- at the end of the statement, and if no Admin remains the statement aborts and
-- rolls back, so the guard and the write are one atomic step.
-- The Go layer maps the "last_admin" error to auth.ErrLastAdmin.
CREATE TRIGGER users_last_admin_on_demote AFTER UPDATE OF is_admin ON users
WHEN OLD.is_admin = 1 AND NEW.is_admin = 0
BEGIN
  SELECT RAISE(ABORT, 'last_admin') WHERE NOT EXISTS (SELECT 1 FROM users WHERE is_admin = 1);
END;

CREATE TRIGGER users_last_admin_on_delete AFTER DELETE ON users
WHEN OLD.is_admin = 1
BEGIN
  SELECT RAISE(ABORT, 'last_admin') WHERE NOT EXISTS (SELECT 1 FROM users WHERE is_admin = 1);
END;
