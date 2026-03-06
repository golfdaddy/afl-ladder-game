-- Delete "Bouies Ladder Comp 2026" competition and all related data
DELETE FROM competition_members WHERE competition_id IN (
  SELECT id FROM competitions WHERE name ILIKE '%bouies%'
);
DELETE FROM competition_invites WHERE competition_id IN (
  SELECT id FROM competitions WHERE name ILIKE '%bouies%'
);
DELETE FROM competitions WHERE name ILIKE '%bouies%';
