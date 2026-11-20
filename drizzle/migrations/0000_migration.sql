create type public.app_role as enum ('staff');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

-- First account created becomes staff automatically
create or replace function public.grant_first_staff()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_roles where role = 'staff') then
    insert into public.user_roles(user_id, role) values (new.id, 'staff');
  end if;
  return new;
end $$;
create trigger on_auth_user_created_staff after insert on auth.users
for each row execute function public.grant_first_staff();

create table public.settings (
  id int primary key default 1 check (id = 1),
  avg_minutes int not null default 15
);
insert into public.settings(id, avg_minutes) values (1, 15);
grant select, update on public.settings to authenticated;
grant all on public.settings to service_role;
alter table public.settings enable row level security;
create policy "staff read settings" on public.settings for select to authenticated using (public.has_role(auth.uid(),'staff'));
create policy "staff update settings" on public.settings for update to authenticated using (public.has_role(auth.uid(),'staff'));

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  access_token uuid not null default gen_random_uuid(),
  code text not null,
  service text not null check (service in ('consulta','castracao','vacinacao','retorno')),
  status text not null default 'waiting' check (status in ('waiting','called','done','no_show','cancelled')),
  tutor_name text not null,
  cpf text not null,
  phone text not null,
  cep text not null,
  street text not null,
  number text not null,
  neighborhood text not null,
  animal_name text not null,
  species text not null check (species in ('cao','gato')),
  doc_path text,
  created_at timestamptz not null default now(),
  called_at timestamptz,
  finished_at timestamptz
);
create index tickets_created_idx on public.tickets(created_at);
grant select, update on public.tickets to authenticated;
grant all on public.tickets to service_role;
alter table public.tickets enable row level security;
create policy "staff read tickets" on public.tickets for select to authenticated using (public.has_role(auth.uid(),'staff'));
create policy "staff update tickets" on public.tickets for update to authenticated using (public.has_role(auth.uid(),'staff'));
alter publication supabase_realtime add table public.tickets;

create or replace function public.next_ticket_code(_service text)
returns text language plpgsql security definer set search_path = public as $$
declare prefix text; n int;
begin
  prefix := case _service when 'consulta' then 'VET' when 'castracao' then 'CAS' when 'vacinacao' then 'VAC' else 'RET' end;
  perform pg_advisory_xact_lock(hashtext(prefix));
  select count(*) + 1 into n from public.tickets
    where service = _service and created_at >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  return prefix || '-' || lpad(n::text, 3, '0');
end $$;
revoke execute on function public.next_ticket_code(text) from public, anon, authenticated;
grant execute on function public.next_ticket_code(text) to service_role;

insert into public.tickets (code, service, status, tutor_name, cpf, phone, cep, street, number, neighborhood, animal_name, species, created_at) values
('VET-001','consulta','waiting','Maria Aparecida Souza','123.456.789-09','(17) 99812-3344','14780-000','Rua 20','1234','Centro','Thor','cao', now() - interval '48 minutes'),
('VAC-001','vacinacao','waiting','João Pedro Oliveira','987.654.321-00','(17) 99701-2211','14783-120','Avenida 43','567','América','Mel','cao', now() - interval '35 minutes'),
('CAS-001','castracao','waiting','Ana Carolina Ribeiro','111.444.777-35','(17) 98845-6677','14785-300','Rua Los Angeles','89','Los Angeles','Mimi','gato', now() - interval '22 minutes'),
('RET-001','retorno','waiting','Carlos Henrique Lima','529.982.247-25','(17) 99623-9988','14781-050','Rua 8','310','Ibirapuera','Bob','cao', now() - interval '14 minutes'),
('VET-002','consulta','waiting','Fernanda Alves Costa','390.533.447-05','(17) 99134-5566','14784-200','Avenida 15','1020','Pedro Cavalini','Luna','gato', now() - interval '6 minutes');