-- Pochettes hebergees par nos soins.
--
--   node --env-file=.env.local scripts/run-sql.mjs supabase/migration-8.sql

-- 1. Bucket public : les pochettes sont servies directement par le CDN Supabase,
-- sans jeton, comme n'importe quelle image publique.
insert into storage.buckets (id, name, public)
     values ('covers', 'covers', true)
on conflict (id) do update set public = true;

-- 2. On garde l'URL d'origine.
--
-- Elle sert de cle de rattrapage — un album deja rapatrie ne l'est pas deux fois —
-- et permet de tout regenerer si l'on change un jour de taille ou de format.
alter table public.albums add column if not exists cover_source text;

-- 3. Controle
select id, name, public from storage.buckets where id = 'covers';

select count(*) filter (where cover like '%/storage/v1/object/public/covers/%') as hebergees,
       count(*) filter (where cover <> '' and cover not like '%/storage/v1/object/public/covers/%') as distantes,
       count(*) filter (where cover = '') as sans_pochette
  from public.albums;
