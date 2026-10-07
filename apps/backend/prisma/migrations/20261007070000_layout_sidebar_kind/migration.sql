-- Sidebar commune (06 — Structure d'une page) : troisième zone partagée.
-- La ligne de `layout_parts` est créée dans la migration suivante : une valeur
-- d'enum ne peut pas servir dans la transaction qui l'ajoute.
ALTER TYPE "layout_kind" ADD VALUE 'sidebar';
