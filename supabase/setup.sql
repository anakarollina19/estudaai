-- EstudaAI: banco de dados no Supabase.
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Pode rodar de novo sem problema. No fim, troque o e-mail do admin se precisar.

-- Perfis: um por conta, criado automaticamente no cadastro.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  is_admin boolean not null default false,
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);

-- Aulas de cada pessoa (todo o conteúdo do app em um JSON).
create table if not exists public.lesson_dbs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.lesson_dbs enable row level security;

-- Acesso explícito pela API, para funcionar mesmo com "Expor automaticamente novas tabelas"
-- desligado. Só quem está logado (authenticated) acessa; as regras (RLS) abaixo limitam
-- cada pessoa às próprias linhas. Visitantes sem login (anon) não acessam nada.
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.lesson_dbs to authenticated;
revoke all on public.profiles, public.lesson_dbs from anon;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

create or replace function public.is_blocked() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select blocked from profiles where id = auth.uid()), false);
$$;

-- Cada pessoa vê só o próprio perfil e não pode se tornar admin nem se desbloquear.
drop policy if exists "ver o próprio perfil" on public.profiles;
create policy "ver o próprio perfil" on public.profiles
  for select using (id = auth.uid());

-- Cada pessoa lê e grava só as próprias aulas, e quem está bloqueado não acessa.
drop policy if exists "próprias aulas" on public.lesson_dbs;
create policy "próprias aulas" on public.lesson_dbs
  for all using (user_id = auth.uid() and not public.is_blocked())
  with check (user_id = auth.uid() and not public.is_blocked());

-- Cria o perfil quando alguém se cadastra.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----- Funções do painel de admin (só funcionam para quem tem is_admin) -----

create or replace function public.admin_list_users()
returns table (id uuid, email text, name text, is_admin boolean, blocked boolean,
               created_at timestamptz, last_sign_in_at timestamptz, lessons int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Apenas administradores'; end if;
  return query
    select p.id, p.email, p.name, p.is_admin, p.blocked, p.created_at, u.last_sign_in_at,
      coalesce((select sum(jsonb_array_length(f -> 'lessons'))::int
                from jsonb_array_elements(d.data -> 'folders') f), 0)
    from profiles p
    join auth.users u on u.id = p.id
    left join lesson_dbs d on d.user_id = p.id
    order by p.created_at desc;
end;
$$;

create or replace function public.admin_set_blocked(target uuid, value boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Apenas administradores'; end if;
  if target = auth.uid() then raise exception 'Você não pode bloquear a própria conta'; end if;
  update profiles set blocked = value where id = target;
end;
$$;

create or replace function public.admin_delete_user(target uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'Apenas administradores'; end if;
  if target = auth.uid() then raise exception 'Você não pode excluir a própria conta'; end if;
  delete from auth.users where id = target; -- apaga perfil e aulas junto (on delete cascade)
end;
$$;

revoke all on function public.admin_list_users() from anon, public;
revoke all on function public.admin_set_blocked(uuid, boolean) from anon, public;
revoke all on function public.admin_delete_user(uuid) from anon, public;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_blocked(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.is_admin(), public.is_blocked() to authenticated;

-- ----- Quem é admin -----
-- Depois de criar sua conta no app, rode esta linha (com o seu e-mail):
update public.profiles set is_admin = true where email = 'SEU_EMAIL_AQUI';
