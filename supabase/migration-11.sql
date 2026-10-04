-- Pays de l'artiste.
--
--   node --env-file=.env.local scripts/run-sql.mjs supabase/migration-11.sql
--
-- A appliquer AVANT de deployer le code qui lit la colonne : la requete des
-- listes la selectionne, et echouerait tant qu'elle n'existe pas.
--
-- Code ISO 3166-1 alpha-2 (« GB », « FR »), et non un libelle : le nom affiche
-- est traduit au rendu, et deux graphies d'un meme pays ne peuvent pas coexister.
--
-- Porte par l'album et non par une table d'artistes, comme l'annee ou les
-- genres : `scripts/fill-countries.mjs` le renseigne artiste par artiste et le
-- recopie sur chacun de ses albums. Une correction manuelle reste possible
-- album par album depuis le formulaire.

alter table public.albums
  add column if not exists artist_country text;

alter table public.albums drop constraint if exists albums_artist_country_format;
alter table public.albums add  constraint albums_artist_country_format
  check (artist_country is null or artist_country ~ '^[A-Z]{2}$');

-- Controle
select list,
       count(*)              as albums,
       count(artist_country) as avec_pays
  from public.albums
 group by list
 order by list;
