-- Liaison manuelle d'un album vers un vinyle de la collection.
--
--   node --env-file=.env.local scripts/run-sql.mjs supabase/migration-10.sql
--
-- Le rapprochement reste automatique par defaut, sur le titre normalise. Cette
-- colonne ne sert qu'aux cas que la regle ne peut pas deviner : un pressage
-- dont le titre s'ecarte trop de l'album, une compilation, une reedition sous
-- un autre nom.
--
-- `on delete set null` : supprimer un vinyle libere les albums qui le
-- designaient, au lieu de laisser des liens morts.

alter table public.albums
  add column if not exists vinyl_id uuid references public.albums(id) on delete set null;

-- Un album ne se lie pas a lui-meme.
alter table public.albums drop constraint if exists albums_vinyl_id_not_self;
alter table public.albums add  constraint albums_vinyl_id_not_self
  check (vinyl_id is null or vinyl_id <> id);

-- Retrouver les albums lies a un vinyle donne, pour le detacher proprement.
create index if not exists albums_vinyl_id_idx
  on public.albums (vinyl_id) where vinyl_id is not null;

-- Controle
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'albums' and column_name = 'vinyl_id';

select count(*) filter (where vinyl_id is not null) as liaisons_manuelles,
       count(*) as albums
  from public.albums;
