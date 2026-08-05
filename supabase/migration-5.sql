-- ============================================================
--  Migration 5 : genres musicaux
--
--  Alimentee par scripts/fill-deezer-metadata.mjs, qui remplit
--  aussi la colonne `year` restee vide depuis l'import Topsters.
--  Ces deux donnees ne sont pas saisies dans le formulaire.
--
--  Script idempotent : relancable sans risque.
-- ============================================================

alter table public.albums
  add column if not exists genres text[];

-- Recherche par genre : un index GIN rend le `contains` efficace
-- si l'on decide un jour de filtrer cote base plutot qu'en memoire.
create index if not exists albums_genres_idx on public.albums using gin (genres);

-- ------------------------------------------------------------
--  Verification
-- ------------------------------------------------------------
select list,
       count(*)                                as albums,
       count(nullif(year, ''))                 as avec_annee,
       count(*) filter (where genres is not null
                          and cardinality(genres) > 0) as avec_genre
  from public.albums
 group by list
 order by list;
