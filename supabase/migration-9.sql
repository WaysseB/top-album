-- Reordonnancement manuel sur toutes les listes.
--
--   node --env-file=.env.local scripts/run-sql.mjs supabase/migration-9.sql
--
-- Les listes non classees s'affichaient par ordre alphabetique, `position`
-- etant ignoree. Elles redeviennent ordonnancables a la main, donc `position`
-- reprend son role d'ordre d'affichage.
--
-- Sans cette migration, elles retomberaient d'un coup sur des positions
-- heritees de leur import — un ordre que personne n'a choisi et qui n'a plus
-- rien a voir avec ce qui est actuellement a l'ecran. On fige donc l'ordre
-- alphabetique affiche aujourd'hui comme point de depart.

with ordonnee as (
  select id,
         row_number() over (
           partition by list
           order by artist collate "fr-FR-x-icu", title collate "fr-FR-x-icu"
         ) as rang
    from public.albums
   where list <> 'top'   -- le top a deja son classement, on n'y touche pas
)
update public.albums a
   set "position" = o.rang
  from ordonnee o
 where a.id = o.id;

-- Controle : chaque liste doit etre numerotee de 1 a N, sans trou ni doublon.
select list,
       count(*)                as albums,
       min("position")         as premiere,
       max("position")         as derniere,
       count(distinct "position") as positions_distinctes
  from public.albums
 group by list
 order by list;
