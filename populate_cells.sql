-- Script per popolare le celle mancanti nel database
-- Prima verifica quali celle esistono già
WITH existing_cells AS (
  SELECT cell_number FROM cells
),
-- Definisci tutte le celle che dovrebbero esistere
required_cells AS (
  SELECT cell_number FROM (
    -- Buche da 4 a 13
    SELECT 'Buca ' || generate_series(4, 13) as cell_number
    UNION ALL
    -- Buche da 30 a 33
    SELECT 'Buca ' || generate_series(30, 33) as cell_number
    UNION ALL
    -- Preparazione 1-3
    SELECT 'Preparazione ' || generate_series(1, 3) as cell_number
  ) as all_cells
)
-- Inserisci solo le celle mancanti
INSERT INTO cells (cell_number, cards)
SELECT 
  rc.cell_number,
  jsonb_build_array(
    jsonb_build_object(
      'status', 'default',
      'startTime', null,
      'endTime', null,
      'TR', '',
      'ID', '',
      'N', '',
      'Note', ''
    ),
    jsonb_build_object(
      'status', 'default',
      'startTime', null,
      'endTime', null,
      'TR', '',
      'ID', '',
      'N', '',
      'Note', ''
    ),
    jsonb_build_object(
      'status', 'default',
      'startTime', null,
      'endTime', null,
      'TR', '',
      'ID', '',
      'N', '',
      'Note', ''
    ),
    jsonb_build_object(
      'status', 'default',
      'startTime', null,
      'endTime', null,
      'TR', '',
      'ID', '',
      'N', '',
      'Note', ''
    )
  ) as cards
FROM required_cells rc
LEFT JOIN existing_cells ec ON rc.cell_number = ec.cell_number
WHERE ec.cell_number IS NULL;

-- Verifica il risultato
SELECT cell_number, created_at 
FROM cells 
ORDER BY cell_number; 