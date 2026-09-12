-- Supabase Auth + Stripe subscription profiles for Kipper.
-- Run this in the Supabase SQL editor for the project used by the app.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  manual_access boolean not null default false,
  manual_access_until timestamptz,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text not null default 'none',
  plan text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Utilizadores podem apenas consultar o seu próprio perfil.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

-- Todas as alterações são feitas pelo backend com a secret/service role.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

-- Cria automaticamente um perfil quando nasce um utilizador Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
create trigger on_auth_user_created
after insert or update of email on auth.users
for each row execute function public.handle_new_user();

-- Preenche perfis para utilizadores que já existam.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do update set email = excluded.email, updated_at = now();
