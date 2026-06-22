create schema if not exists private;

create or replace function private.criar_profile_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadados jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if (
    nullif(trim(coalesce(metadados ->> 'full_name', '')), '') is null
    or nullif(trim(coalesce(metadados ->> 'profession', '')), '') is null
    or nullif(trim(coalesce(metadados ->> 'work_area', '')), '') is null
    or nullif(trim(coalesce(metadados ->> 'company_name', '')), '') is null
    or regexp_replace(coalesce(metadados ->> 'whatsapp', ''), '[^0-9]', '', 'g') !~ '^[0-9]{10,15}$'
    or nullif(trim(coalesce(metadados ->> 'city', '')), '') is null
    or nullif(trim(coalesce(metadados ->> 'state', '')), '') is null
    or nullif(trim(coalesce(metadados ->> 'country', '')), '') is null
  ) then
    return new;
  end if;

  insert into public.profiles (
    id,
    full_name,
    profession,
    work_area,
    company_name,
    whatsapp,
    city,
    state,
    country,
    accepted_terms_at,
    accepted_privacy_policy_at,
    accepted_cookies_at,
    accepted_free_use_communication_terms_at,
    communication_consent_email,
    communication_consent_whatsapp,
    communication_consent_ip,
    communication_consent_user_agent
  )
  values (
    new.id,
    nullif(trim(metadados ->> 'full_name'), ''),
    nullif(trim(metadados ->> 'profession'), ''),
    nullif(trim(metadados ->> 'work_area'), ''),
    nullif(trim(metadados ->> 'company_name'), ''),
    regexp_replace(coalesce(metadados ->> 'whatsapp', ''), '[^0-9]', '', 'g'),
    nullif(trim(metadados ->> 'city'), ''),
    nullif(trim(metadados ->> 'state'), ''),
    nullif(trim(metadados ->> 'country'), ''),
    coalesce(nullif(metadados ->> 'accepted_terms_at', '')::timestamptz, now()),
    coalesce(nullif(metadados ->> 'accepted_privacy_policy_at', '')::timestamptz, now()),
    coalesce(nullif(metadados ->> 'accepted_cookies_at', '')::timestamptz, now()),
    coalesce(nullif(metadados ->> 'accepted_free_use_communication_terms_at', '')::timestamptz, now()),
    true,
    true,
    nullif(metadados ->> 'communication_consent_ip', ''),
    nullif(metadados ->> 'communication_consent_user_agent', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profiles on auth.users;

create trigger on_auth_user_created_profiles
after insert on auth.users
for each row
execute function private.criar_profile_auth();
