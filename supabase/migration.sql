-- ============================================================
--  Aligne la table `albums` (importee depuis le CSV Topsters)
--  sur le modele utilise par l'application.
--
--  Cible :
--    id         uuid    PK, default gen_random_uuid()
--    title      text    not null
--    artist     text    not null default ''
--    year       text    not null default ''
--    cover      text    not null default ''
--    note       text    null
--    position   integer not null   (ordre du classement, 1 = premier)
--    created_at timestamptz not null default now()
--
--  Script idempotent : relancable sans risque.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Renommage des colonnes issues du CSV
-- ------------------------------------------------------------
do $$
declare
  has_col boolean;
begin
  -- album -> title
  select exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'albums' and column_name = 'album') into has_col;
  if has_col and not exists (select 1 from information_schema.columns
                             where table_schema = 'public' and table_name = 'albums' and column_name = 'title') then
    alter table public.albums rename column album to title;
  end if;

  -- cover_url -> cover
  select exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'albums' and column_name = 'cover_url') into has_col;
  if has_col and not exists (select 1 from information_schema.columns
                             where table_schema = 'public' and table_name = 'albums' and column_name = 'cover') then
    alter table public.albums rename column cover_url to cover;
  end if;

  -- rank -> position
  select exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'albums' and column_name = 'rank') into has_col;
  if has_col and not exists (select 1 from information_schema.columns
                             where table_schema = 'public' and table_name = 'albums' and column_name = 'position') then
    alter table public.albums rename column "rank" to "position";
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Colonnes manquantes
-- ------------------------------------------------------------
alter table public.albums add column if not exists year       text;
alter table public.albums add column if not exists note       text;
alter table public.albums add column if not exists cover      text;
alter table public.albums add column if not exists created_at timestamptz not null default now();

-- ------------------------------------------------------------
-- 3. Les 9 albums dont le titre Topsters ne contenait pas
--    le separateur " - " : l'artiste n'a pas pu etre deduit.
-- ------------------------------------------------------------
update public.albums a
set artist = v.artist
from (values
  ('Welcome to Sky Valley',                'Kyuss'),
  ('PetroDragonic Apocalypse',             'King Gizzard & The Lizard Wizard'),
  ('From Mars to Sirius',                  'Gojira'),
  ('Breakfast In America (Deluxe Edition)', 'Supertramp'),
  ('Souvlaki',                             'Slowdive'),
  ('American Football',                    'American Football'),
  ('Sound Of Silver',                      'LCD Soundsystem'),
  ('Franz Ferdinand',                      'Franz Ferdinand'),
  ('Wolfgang Amadeus Phoenix',             'Phoenix')
) as v(title, artist)
where a.title = v.title
  and coalesce(a.artist, '') = '';

-- La colonne full_title n'est plus utilisee par l'application.
alter table public.albums drop column if exists full_title;

-- ------------------------------------------------------------
-- 4. Types (l'import CSV cree souvent tout en text)
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  -- position -> integer
  select data_type into t from information_schema.columns
   where table_schema = 'public' and table_name = 'albums' and column_name = 'position';
  if t is not null and t <> 'integer' then
    alter table public.albums
      alter column "position" type integer using nullif(trim("position"::text), '')::integer;
  end if;

  -- id -> uuid
  select data_type into t from information_schema.columns
   where table_schema = 'public' and table_name = 'albums' and column_name = 'id';
  if t = 'text' or t = 'character varying' then
    alter table public.albums alter column id type uuid using id::uuid;
  end if;
end $$;

alter table public.albums alter column id set default gen_random_uuid();

-- Cle primaire sur id si la table n'en a pas
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.albums'::regclass and contype = 'p'
  ) then
    alter table public.albums add primary key (id);
  end if;
end $$;

-- ------------------------------------------------------------
-- 5. Valeurs par defaut et contraintes NOT NULL
-- ------------------------------------------------------------
update public.albums
set artist = coalesce(artist, ''),
    year   = coalesce(year, ''),
    cover  = coalesce(cover, '');

-- Les lignes sans position passent a la fin du classement.
update public.albums a
set "position" = s.ord + coalesce((select max("position") from public.albums where "position" is not null), 0)
from (select id, row_number() over (order by created_at, title) as ord
        from public.albums where "position" is null) s
where a.id = s.id;

alter table public.albums
  alter column title      set not null,
  alter column artist     set default '',
  alter column artist     set not null,
  alter column year       set default '',
  alter column year       set not null,
  alter column cover      set default '',
  alter column cover      set not null,
  alter column "position" set not null;

-- Index d'ordonnancement (volontairement NON unique : un reordonnancement
-- en masse violerait transitoirement une contrainte d'unicite).
create index if not exists albums_position_idx on public.albums ("position");

-- ------------------------------------------------------------
-- 6. Reordonnancement atomique (appele par l'application)
--    Recoit la liste des id dans le nouvel ordre.
-- ------------------------------------------------------------
create or replace function public.reorder_albums(ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.albums a
     set "position" = x.ord
    from unnest(ids) with ordinality as x(id, ord)
   where a.id = x.id;
$$;

-- Seule la cle service_role peut reordonner (la fonction est SECURITY DEFINER :
-- on ne l'expose surtout pas a anon).
revoke all on function public.reorder_albums(uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_albums(uuid[]) to service_role;

-- ------------------------------------------------------------
-- 7. Securite : lecture publique, ecriture reservee au serveur
-- ------------------------------------------------------------
alter table public.albums enable row level security;

drop policy if exists "albums_select_public" on public.albums;
create policy "albums_select_public"
  on public.albums for select
  to anon, authenticated
  using (true);

-- Aucune policy insert/update/delete : seule la cle service_role
-- (utilisee cote serveur uniquement) peut ecrire.

-- ------------------------------------------------------------
-- 8. Verification
-- ------------------------------------------------------------
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'albums'
 order by ordinal_position;

select count(*) as total,
       count(*) filter (where artist = '') as sans_artiste
  from public.albums;
