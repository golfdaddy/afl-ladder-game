-- Migration 006: Remove test competition
DELETE FROM competitions WHERE name = 'Buies Ladder Comp 2026';
