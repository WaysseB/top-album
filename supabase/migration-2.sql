-- ============================================================
--  Migration 2 : deux listes, titre prefere, lien Deezer
--
--  Ajoute :
--    list           text    'top' | 'wannabe'  (not null, default 'top')
--    favorite_track text    null
--    deezer_url     text    null
--
--  Et renumerote `position` a partir de 1 DANS CHAQUE LISTE.
--
--  Script idempotent : relancable sans risque.
--  Prerequis : supabase/migration.sql doit avoir ete joue.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Nouvelles colonnes
-- ------------------------------------------------------------
alter table public.albums
  add column if not exists list           text not null default 'top',
  add column if not exists favorite_track text,
  add column if not exists deezer_url     text;

alter table public.albums drop constraint if exists albums_list_check;
alter table public.albums add  constraint albums_list_check check (list in ('top', 'wannabe'));

-- ------------------------------------------------------------
-- 2. Repartition initiale
--    Le classement historique s'arrete au 100e ; au-dela, on
--    considere qu'il s'agit d'albums en attente.
-- ------------------------------------------------------------
update public.albums
   set list = 'wannabe'
 where "position" > 100
   and list = 'top';

-- ------------------------------------------------------------
-- 3. Renumerotation : chaque liste repart de 1
-- ------------------------------------------------------------
with ranked as (
  select id,
         row_number() over (partition by list order by "position", created_at) as ord
    from public.albums
)
update public.albums a
   set "position" = r.ord
  from ranked r
 where a.id = r.id
   and a."position" is distinct from r.ord;

-- ------------------------------------------------------------
-- 4. Index d'ordonnancement par liste
--    (toujours NON unique : un reordonnancement en masse
--     violerait transitoirement une contrainte d'unicite)
-- ------------------------------------------------------------
create index if not exists albums_list_position_idx on public.albums (list, "position");

-- ------------------------------------------------------------
-- 5. Verification
-- ------------------------------------------------------------
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'albums'
 order by ordinal_position;

select list,
       count(*)            as albums,
       min("position")     as premiere_position,
       max("position")     as derniere_position,
       count(deezer_url)   as avec_lien_deezer,
       count(favorite_track) as avec_titre_prefere
  from public.albums
 group by list
 order by list;
