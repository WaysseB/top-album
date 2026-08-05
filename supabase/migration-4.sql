-- ============================================================
--  Migration 4 : liens Spotify et Apple Music
--
--  Deux colonnes facultatives, renseignees a la main depuis le
--  formulaire. Contrairement a Deezer, aucun lecteur integre :
--  la fiche affiche un simple bouton de redirection.
--
--  Script idempotent : relancable sans risque.
-- ============================================================

alter table public.albums
  add column if not exists spotify_url     text,
  add column if not exists apple_music_url text;

-- ------------------------------------------------------------
--  Verification
-- ------------------------------------------------------------
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'albums'
   and column_name in ('deezer_url', 'spotify_url', 'apple_music_url')
 order by column_name;

select list,
       count(*)                  as albums,
       count(deezer_url)         as deezer,
       count(spotify_url)        as spotify,
       count(apple_music_url)    as apple_music
  from public.albums
 group by list
 order by list;
