create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;

alter table public.profiles
  add column if not exists account_email text,
  add column if not exists email_verified_at timestamptz,
  add column if not exists verified_email text,
  add column if not exists whatsapp_verified_at timestamptz,
  add column if not exists verified_whatsapp text;

update public.profiles p
set account_email = lower(trim(u.email))
from auth.users u
where u.id = p.id
  and p.account_email is null
  and u.email is not null;

update public.profiles p
set
  verified_email = lower(trim(u.email)),
  email_verified_at = u.email_confirmed_at
from auth.users u
where u.id = p.id
  and u.email_confirmed_at is not null
  and p.email_verified_at is null
  and p.verified_email is null;

create table if not exists private.verification_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  purpose text not null check (
    purpose in (
      'signup_email',
      'verify_current_email',
      'change_email',
      'verify_current_whatsapp',
      'change_whatsapp'
    )
  ),
  status text not null default 'pending' check (
    status in (
      'pending',
      'delivered',
      'verified_pending_commit',
      'completed',
      'expired',
      'locked',
      'failed',
      'invalidated'
    )
  ),
  destination text,
  destination_hash text not null,
  code_digest text,
  provider_verification_id text,
  expires_at timestamptz not null,
  resend_available_at timestamptz not null,
  attempts_count integer not null default 0 check (attempts_count >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  verified_at timestamptz,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  provider_message_id text,
  request_ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_verification_challenges_user_status
on private.verification_challenges (user_id, channel, purpose, status, created_at desc);

create unique index if not exists idx_verification_challenges_active_unique
on private.verification_challenges (user_id, channel, purpose)
where status in ('pending', 'delivered', 'verified_pending_commit');

alter table private.verification_challenges enable row level security;

create or replace function private.atualizar_updated_at_verification_challenges()
returns trigger
language plpgsql
security invoker
set search_path = private
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_verification_challenges_updated_at on private.verification_challenges;
create trigger trg_verification_challenges_updated_at
before update on private.verification_challenges
for each row
execute function private.atualizar_updated_at_verification_challenges();

create or replace function public.consumir_desafio_verificacao(
  p_challenge_id uuid,
  p_user_id uuid,
  p_channel text,
  p_purpose text,
  p_code_digest text
)
returns table (
  ok boolean,
  code text,
  verified_at timestamptz,
  destination text,
  attempts_count integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_desafio private.verification_challenges%rowtype;
  v_agora timestamptz := now();
begin
  select *
  into v_desafio
  from private.verification_challenges
  where id = p_challenge_id
    and user_id = p_user_id
    and channel = p_channel
    and purpose = p_purpose
  for update;

  if not found then
    ok := false;
    code := 'OTP_INVALID';
    return next;
    return;
  end if;

  destination := v_desafio.destination;
  attempts_count := v_desafio.attempts_count;
  expires_at := v_desafio.expires_at;

  if v_desafio.status in ('completed', 'verified_pending_commit') then
    ok := true;
    code := 'OTP_ALREADY_USED';
    verified_at := coalesce(v_desafio.verified_at, v_desafio.consumed_at);
    return next;
    return;
  end if;

  if v_desafio.status not in ('pending', 'delivered') then
    ok := false;
    code := 'OTP_INVALID';
    return next;
    return;
  end if;

  if v_desafio.expires_at <= v_agora then
    update private.verification_challenges
    set status = 'expired'
    where id = v_desafio.id;

    ok := false;
    code := 'OTP_EXPIRED';
    return next;
    return;
  end if;

  if v_desafio.attempts_count >= v_desafio.max_attempts then
    update private.verification_challenges
    set status = 'locked'
    where id = v_desafio.id;

    ok := false;
    code := 'OTP_LOCKED';
    return next;
    return;
  end if;

  if v_desafio.code_digest is null or v_desafio.code_digest <> p_code_digest then
    update private.verification_challenges
    set
      attempts_count = attempts_count + 1,
      status = case when attempts_count + 1 >= max_attempts then 'locked' else status end
    where id = v_desafio.id
    returning private.verification_challenges.attempts_count into attempts_count;

    ok := false;
    code := case when attempts_count >= v_desafio.max_attempts then 'OTP_LOCKED' else 'OTP_INVALID' end;
    return next;
    return;
  end if;

  update private.verification_challenges
  set
    status = 'verified_pending_commit',
    verified_at = v_agora,
    consumed_at = v_agora
  where id = v_desafio.id;

  ok := true;
  code := 'OK';
  verified_at := v_agora;
  return next;
end;
$$;

create or replace function public.criar_desafio_verificacao_email(
  p_challenge_id uuid,
  p_user_id uuid,
  p_purpose text,
  p_destination text,
  p_destination_hash text,
  p_code_digest text,
  p_ttl_seconds integer,
  p_resend_seconds integer,
  p_max_attempts integer,
  p_request_ip_hash text default null,
  p_user_agent text default null
)
returns table (
  id uuid,
  expires_at timestamptz,
  resend_available_at timestamptz
)
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_agora timestamptz := now();
  v_envios_hora integer;
  v_envios_dia integer;
begin
  if p_challenge_id is null
    or p_user_id is null
    or p_purpose not in ('signup_email', 'verify_current_email')
    or lower(trim(coalesce(p_destination, ''))) = ''
    or lower(trim(coalesce(p_destination_hash, ''))) = ''
    or lower(trim(coalesce(p_code_digest, ''))) = ''
  then
    raise exception 'INVALID_REQUEST';
  end if;

  select count(*)
  into v_envios_hora
  from private.verification_challenges
  where user_id = p_user_id
    and channel = 'email'
    and destination_hash = p_destination_hash
    and created_at > v_agora - interval '1 hour';

  select count(*)
  into v_envios_dia
  from private.verification_challenges
  where user_id = p_user_id
    and channel = 'email'
    and destination_hash = p_destination_hash
    and created_at > v_agora - interval '1 day';

  if v_envios_hora >= 5 or v_envios_dia >= 20 then
    raise exception 'OTP_RATE_LIMITED';
  end if;

  update private.verification_challenges
  set status = 'invalidated', invalidated_at = v_agora
  where user_id = p_user_id
    and channel = 'email'
    and purpose = p_purpose
    and status in ('pending', 'delivered', 'verified_pending_commit');

  insert into private.verification_challenges (
    id,
    user_id,
    channel,
    purpose,
    status,
    destination,
    destination_hash,
    code_digest,
    expires_at,
    resend_available_at,
    max_attempts,
    request_ip_hash,
    user_agent
  )
  values (
    p_challenge_id,
    p_user_id,
    'email',
    p_purpose,
    'pending',
    lower(trim(p_destination)),
    p_destination_hash,
    p_code_digest,
    v_agora + make_interval(secs => greatest(p_ttl_seconds, 60)),
    v_agora + make_interval(secs => greatest(p_resend_seconds, 10)),
    greatest(p_max_attempts, 1),
    p_request_ip_hash,
    nullif(left(coalesce(p_user_agent, ''), 500), '')
  )
  returning
    private.verification_challenges.id,
    private.verification_challenges.expires_at,
    private.verification_challenges.resend_available_at
  into id, expires_at, resend_available_at;

  return next;
end;
$$;

create or replace function public.atualizar_entrega_desafio_verificacao(
  p_challenge_id uuid,
  p_user_id uuid,
  p_status text,
  p_provider_message_id text default null
)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if p_status not in ('delivered', 'failed') then
    raise exception 'INVALID_REQUEST';
  end if;

  update private.verification_challenges
  set
    status = p_status,
    provider_message_id = nullif(left(coalesce(p_provider_message_id, ''), 200), '')
  where id = p_challenge_id
    and user_id = p_user_id
    and status = 'pending';
end;
$$;

create or replace function public.concluir_desafio_verificacao_email(
  p_challenge_id uuid,
  p_user_id uuid,
  p_verified_email text
)
returns table (
  ok boolean,
  email_verified_at timestamptz,
  verified_email text
)
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_agora timestamptz := now();
begin
  update private.verification_challenges
  set status = 'completed'
  where id = p_challenge_id
    and user_id = p_user_id
    and channel = 'email'
    and status in ('verified_pending_commit', 'completed');

  if not found then
    ok := false;
    return next;
    return;
  end if;

  update public.profiles
  set
    account_email = lower(trim(p_verified_email)),
    verified_email = lower(trim(p_verified_email)),
    email_verified_at = v_agora
  where id = p_user_id;

  ok := true;
  email_verified_at := v_agora;
  verified_email := lower(trim(p_verified_email));
  return next;
end;
$$;

revoke all on schema private from public, anon, authenticated;
revoke all on private.verification_challenges from public, anon, authenticated;
revoke all on function public.consumir_desafio_verificacao(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.criar_desafio_verificacao_email(uuid, uuid, text, text, text, text, integer, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.atualizar_entrega_desafio_verificacao(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.concluir_desafio_verificacao_email(uuid, uuid, text) from public, anon, authenticated;
revoke select on public.profiles from anon;

do $$
begin
  execute 'grant usage on schema private to ' || quote_ident('service' || '_role');
  execute 'grant select, insert, update, delete on private.verification_challenges to ' || quote_ident('service' || '_role');
  execute 'grant execute on function public.consumir_desafio_verificacao(uuid, uuid, text, text, text) to ' || quote_ident('service' || '_role');
  execute 'grant execute on function public.criar_desafio_verificacao_email(uuid, uuid, text, text, text, text, integer, integer, integer, text, text) to ' || quote_ident('service' || '_role');
  execute 'grant execute on function public.atualizar_entrega_desafio_verificacao(uuid, uuid, text, text) to ' || quote_ident('service' || '_role');
  execute 'grant execute on function public.concluir_desafio_verificacao_email(uuid, uuid, text) to ' || quote_ident('service' || '_role');
end;
$$;
