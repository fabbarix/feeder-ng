-- TG (ADR 0010): a Tag carries a colour from the closed palette. Plain SQL: no rebuild, no foreign-key pragma.
ALTER TABLE tags ADD COLUMN colour TEXT NOT NULL DEFAULT 'tomato';

-- A Tag for every key a rule names that no Tag has (the spelling is unknown, so name = key).
INSERT INTO tags (key, name)
  SELECT k, k FROM (
    SELECT tag AS k FROM slot_rules WHERE tag IS NOT NULL AND tag <> ''
    UNION
    SELECT tag FROM variety_rules WHERE tag <> ''
  ) WHERE k NOT IN (SELECT key FROM tags);

-- Colours in name order: what each Tag would have got as the next colour had the Tags been added in that order.
UPDATE tags SET colour = (
  SELECT CASE (r.rn - 1) % 10
    WHEN 0 THEN 'tomato' WHEN 1 THEN 'apricot' WHEN 2 THEN 'mustard' WHEN 3 THEN 'olive' WHEN 4 THEN 'sage'
    WHEN 5 THEN 'teal' WHEN 6 THEN 'sky' WHEN 7 THEN 'blue' WHEN 8 THEN 'plum' ELSE 'rose' END
  FROM (SELECT id, row_number() OVER (ORDER BY lower(name), id) AS rn FROM tags) AS r
  WHERE r.id = tags.id);
