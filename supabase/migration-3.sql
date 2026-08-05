-- ============================================================
--  Migration 3 : compte administrateur
--
--  Une seule table, lue exclusivement cote serveur avec la cle
--  service_role. RLS est active SANS aucune policy : la cle anon,
--  exposee au navigateur, ne peut donc rien y lire.
--
--  Le mot de passe n'est jamais stocke en clair : on conserve une
--  empreinte scrypt au format  scrypt$<sel base64>$<empreinte base64>.
--
--  Script idempotent : relancable sans risque.
-- ============================================================

create table if not exists public.admin_users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- Identifiants insensibles a la casse : « WB » et « wb » sont le meme compte.
create unique index if not exists admin_users_username_key
  on public.admin_users (lower(username));

-- ------------------------------------------------------------
--  Compte unique. L'empreinte correspond au mot de passe choisi.
--  Pour le changer plus tard, voir la note en fin de fichier.
-- ------------------------------------------------------------
insert into public.admin_users (username, password_hash)
values (
  'wb',
  'scrypt$K5NzODqlGVmlrI9J1F73Aw==$tOcA3+6qHUpE6EfLPTRkj0Pi+nbQcibF1loLb6q0oIEhNMEcvOHAsrwJAW5C0PuzrowBaTlYTt8Nd7Hc70kemA=='
)
on conflict (lower(username)) do update
  set password_hash = excluded.password_hash;

-- ------------------------------------------------------------
--  Verrouillage : aucune policy => seule la cle service_role passe.
-- ------------------------------------------------------------
alter table public.admin_users enable row level security;

drop policy if exists "admin_users_select_public" on public.admin_users;

-- ------------------------------------------------------------
--  Verification
-- ------------------------------------------------------------
select username,
       left(password_hash, 7) as schema_empreinte,
       created_at
  from public.admin_users;

select relrowsecurity as rls_active,
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'admin_users') as nb_policies
  from pg_class
 where oid = 'public.admin_users'::regclass;

-- ============================================================
--  Changer le mot de passe plus tard :
--    node -e "const{randomBytes,scryptSync}=require('node:crypto');
--             const s=randomBytes(16);
--             console.log('scrypt$'+s.toString('base64')+'$'+
--               scryptSync('NOUVEAU_MOT_DE_PASSE',s,64).toString('base64'))"
--  puis :
--    update public.admin_users set password_hash = '<resultat>'
--     where lower(username) = 'wb';
-- ============================================================
