-- Collection vinyle synchronisee depuis Discogs.
--
--   node --env-file=.env.local scripts/run-sql.mjs supabase/migration-7.sql

-- 1. Quatrieme liste
alter table public.albums drop constraint if exists albums_list_check;
alter table public.albums add  constraint albums_list_check
  check (list in ('top', 'wannabe', 'ost', 'vinyl'));

-- 2. Support physique : « 2×Vinyl, LP, Album, Reissue ». Nul ailleurs.
alter table public.albums add column if not exists format text;

-- 3. Cle de synchronisation.
--
-- C'est `instance_id` de Discogs qui est stocke, et non l'identifiant de
-- pressage : on peut posseder deux exemplaires du meme disque, et chacun est une
-- ligne distincte de la collection.
--
-- L'unicite est partielle : toutes les autres listes ont cette colonne a NULL,
-- et un index unique complet les mettrait en collision des le deuxieme album.
alter table public.albums add column if not exists discogs_id bigint;

create unique index if not exists albums_discogs_id_key
  on public.albums (discogs_id)
  where discogs_id is not null;

-- 4. Controle
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'albums'
   and column_name in ('format', 'discogs_id')
 order by column_name;

select list, count(*) as albums from public.albums group by list order by list;
