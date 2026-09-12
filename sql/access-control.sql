-- Kipper: Supabase Auth, workspaces isolados e perfis de subscrição.
-- Cada utilizador novo recebe um workspace vazio. Nenhum produto, cliente,
-- encomenda, ingrediente, receita, stock ou despesa é criado automaticamente.

create schema if not exists private;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'O meu negócio',
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  current_workspace_id uuid references public.workspaces(id) on delete set null,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text not null default 'none',
  plan text,
  current_period_end timestamptz,
  manual_access boolean not null default false,
  manual_access_until timestamptz,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key(workspace_id,user_id)
);

create index if not exists profiles_current_workspace_idx on public.profiles(current_workspace_id);
create index if not exists workspace_members_user_idx on public.workspace_members(user_id);
create index if not exists workspaces_owner_user_idx on public.workspaces(owner_user_id);

alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_members enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists "workspace_members_select_own" on public.workspace_members;
create policy "workspace_members_select_own"
on public.workspace_members for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member"
on public.workspaces for select to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspaces.id
      and wm.user_id = (select auth.uid())
  )
);

-- Escritas administrativas passam exclusivamente pelo backend com secret/service role.
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.workspaces from anon, authenticated;
revoke insert, update, delete on public.workspace_members from anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;

-- SECURITY DEFINER necessário apenas para criar a estrutura inicial do utilizador.
-- Fica num schema privado, sem EXECUTE público, e não aceita parâmetros externos.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  new_workspace_id uuid;
begin
  insert into public.workspaces(name, owner_user_id)
  values ('O meu negócio', new.id)
  returning id into new_workspace_id;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'owner');

  insert into public.profiles(id, email, current_workspace_id)
  values (new.id, new.email, new_workspace_id)
  on conflict (id) do update
  set email = excluded.email,
      current_workspace_id = coalesce(public.profiles.current_workspace_id, excluded.current_workspace_id),
      updated_at = now();

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;
revoke all on function private.handle_new_user() from anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();
