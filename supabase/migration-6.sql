-- ============================================================
--  Migration 6 : troisieme liste, les OST de jeux video
--
--  La contrainte n'autorisait que 'top' et 'wannabe'. Une insertion
--  en 'ost' echouait donc avant meme d'atteindre l'application.
--
--  Seul le top reste un classement ordonne : wannabe et ost sont des
--  ensembles. La colonne `position` demeure pour eux, mais comme simple
--  ordre d'affichage stable — l'interface n'affiche plus de numero.
--
--  Script idempotent : relancable sans risque.
-- ============================================================

alter table public.albums drop constraint if exists albums_list_check;
alter table public.albums add  constraint albums_list_check
  check (list in ('top', 'wannabe', 'ost'));

-- ------------------------------------------------------------
--  Verification
-- ------------------------------------------------------------
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'public.albums'::regclass
   and conname = 'albums_list_check';

select list, count(*) as albums, min("position") as premiere, max("position") as derniere
  from public.albums
 group by list
 order by list;
