create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  profession text not null,
  work_area text not null,
  company_name text not null,
  whatsapp text not null,
  city text not null,
  state text not null,
  country text not null,
  accepted_terms_at timestamptz not null,
  accepted_privacy_policy_at timestamptz not null,
  accepted_cookies_at timestamptz not null,
  accepted_free_use_communication_terms_at timestamptz not null,
  communication_consent_email boolean not null default true,
  communication_consent_whatsapp boolean not null default true,
  communication_consent_ip text,
  communication_consent_user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_whatsapp_digits_check check (whatsapp ~ '^[0-9]{10,15}$'),
  constraint profiles_email_consent_required_check check (communication_consent_email is true),
  constraint profiles_whatsapp_consent_required_check check (communication_consent_whatsapp is true)
);

alter table public.profiles enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;

create or replace function public.atualizar_updated_at_profiles()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.atualizar_updated_at_profiles();

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
