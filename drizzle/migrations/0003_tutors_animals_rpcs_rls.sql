
DROP TRIGGER IF EXISTS on_auth_user_created_staff ON auth.users;
DROP FUNCTION IF EXISTS public.grant_first_staff();

CREATE OR REPLACE FUNCTION public.is_staff_or_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('staff','admin'))
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
begin new.updated_at := now(); return new; end $$;

-- tutors
CREATE TABLE public.tutors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text,
  cpf text NOT NULL UNIQUE CHECK (cpf ~ '^[0-9]{11}$'),
  phone text,
  cep text,
  street text,
  number text,
  neighborhood text,
  doc_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutors TO authenticated;
GRANT ALL ON public.tutors TO service_role;
ALTER TABLE public.tutors ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER tutors_updated_at BEFORE UPDATE ON public.tutors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.protect_tutor_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if (new.cpf is distinct from old.cpf or new.user_id is distinct from old.user_id)
     and auth.uid() is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_staff_or_admin(auth.uid()) then
    raise exception 'Você não pode alterar o CPF nem a conta vinculada. Procure a equipe da ABA.';
  end if;
  return new;
end $$;
CREATE TRIGGER tutors_protect_identity BEFORE UPDATE ON public.tutors FOR EACH ROW EXECUTE FUNCTION public.protect_tutor_identity();

CREATE POLICY "tutor read own" ON public.tutors FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff_or_admin(auth.uid()));
CREATE POLICY "tutor insert own" ON public.tutors FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_staff_or_admin(auth.uid()));
CREATE POLICY "tutor update own" ON public.tutors FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_staff_or_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_staff_or_admin(auth.uid()));
CREATE POLICY "admin delete tutors" ON public.tutors FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- animals
CREATE TABLE public.animals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES public.tutors(id) ON DELETE CASCADE,
  name text NOT NULL,
  species text NOT NULL CHECK (species in ('cao','gato')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX animals_tutor_id_idx ON public.animals(tutor_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.animals TO authenticated;
GRANT ALL ON public.animals TO service_role;
ALTER TABLE public.animals ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER animals_updated_at BEFORE UPDATE ON public.animals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.owns_tutor(_tutor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.tutors where id = _tutor_id and user_id = auth.uid())
$$;

CREATE POLICY "animals read" ON public.animals FOR SELECT TO authenticated
  USING (public.owns_tutor(tutor_id) OR public.is_staff_or_admin(auth.uid()));
CREATE POLICY "animals insert" ON public.animals FOR INSERT TO authenticated
  WITH CHECK (public.owns_tutor(tutor_id) OR public.is_staff_or_admin(auth.uid()));
CREATE POLICY "animals update" ON public.animals FOR UPDATE TO authenticated
  USING (public.owns_tutor(tutor_id) OR public.is_staff_or_admin(auth.uid()))
  WITH CHECK (public.owns_tutor(tutor_id) OR public.is_staff_or_admin(auth.uid()));
CREATE POLICY "admin delete animals" ON public.animals FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- tickets
ALTER TABLE public.tickets
  ADD COLUMN tutor_id uuid REFERENCES public.tutors(id) ON DELETE SET NULL,
  ADD COLUMN animal_id uuid REFERENCES public.animals(id) ON DELETE SET NULL;
CREATE INDEX tickets_animal_id_idx ON public.tickets(animal_id);
CREATE UNIQUE INDEX tickets_one_active_per_tutor ON public.tickets(tutor_id) WHERE status in ('waiting','called');
REVOKE ALL ON public.tickets FROM anon;
GRANT SELECT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
DROP POLICY IF EXISTS "staff read tickets" ON public.tickets;
DROP POLICY IF EXISTS "staff update tickets" ON public.tickets;
CREATE POLICY "tickets read" ON public.tickets FOR SELECT TO authenticated
  USING ((tutor_id IS NOT NULL AND public.owns_tutor(tutor_id)) OR public.is_staff_or_admin(auth.uid()));
CREATE POLICY "staff update tickets" ON public.tickets FOR UPDATE TO authenticated
  USING (public.is_staff_or_admin(auth.uid())) WITH CHECK (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "admin delete tickets" ON public.tickets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- settings
REVOKE ALL ON public.settings FROM anon;
GRANT SELECT, UPDATE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
DROP POLICY IF EXISTS "staff read settings" ON public.settings;
DROP POLICY IF EXISTS "staff update settings" ON public.settings;
CREATE POLICY "auth read settings" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin update settings" ON public.settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- user_roles
REVOKE ALL ON public.user_roles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
CREATE POLICY "admin read roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.tutors, public.animals FROM anon;

-- RPCs
CREATE OR REPLACE FUNCTION public.create_ticket(p_animal_id uuid, p_service text)
RETURNS TABLE(id uuid, code text, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare t public.tutors; a public.animals; v_code text; v_id uuid; v_status text;
begin
  if auth.uid() is null then raise exception 'Faça login para retirar uma senha.'; end if;
  select * into t from public.tutors where user_id = auth.uid();
  if t.id is null then raise exception 'Complete seu cadastro antes de retirar uma senha.'; end if;
  if coalesce(trim(t.name),'') = '' or coalesce(trim(t.phone),'') = '' or coalesce(trim(t.cep),'') = ''
     or coalesce(trim(t.street),'') = '' or coalesce(trim(t.number),'') = ''
     or coalesce(trim(t.neighborhood),'') = '' or coalesce(trim(t.doc_path),'') = '' then
    raise exception 'Seu cadastro está incompleto. Preencha todos os dados e envie o documento com foto.';
  end if;
  if p_service not in ('consulta','castracao','vacinacao','retorno') then raise exception 'Serviço inválido.'; end if;
  select * into a from public.animals where animals.id = p_animal_id and tutor_id = t.id;
  if a.id is null then raise exception 'Animal não encontrado no seu cadastro.'; end if;
  perform pg_advisory_xact_lock(hashtext('tutor-ticket-' || t.id::text));
  if exists (select 1 from public.tickets k where k.tutor_id = t.id and k.status in ('waiting','called')) then
    raise exception 'Você já tem uma senha ativa. Cancele-a ou aguarde o atendimento.';
  end if;
  v_code := public.next_ticket_code(p_service);
  begin
    insert into public.tickets (code, service, tutor_name, cpf, phone, cep, street, number, neighborhood,
      animal_name, species, doc_path, tutor_id, animal_id)
    values (v_code, p_service, t.name,
      substr(t.cpf,1,3)||'.'||substr(t.cpf,4,3)||'.'||substr(t.cpf,7,3)||'-'||substr(t.cpf,10,2),
      t.phone, t.cep, t.street, t.number, t.neighborhood, a.name, a.species, t.doc_path, t.id, a.id)
    returning tickets.id, tickets.status into v_id, v_status;
  exception when unique_violation then
    raise exception 'Você já tem uma senha ativa. Cancele-a ou aguarde o atendimento.';
  end;
  return query select v_id, v_code, v_status;
end $$;

CREATE OR REPLACE FUNCTION public.get_my_ticket_status(p_ticket_id uuid)
RETURNS TABLE(code text, status text, service text, animal_name text, pessoas_na_frente int, avg_minutes int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare k public.tickets; n int := 0; m int;
begin
  select tk.* into k from public.tickets tk join public.tutors t on t.id = tk.tutor_id
    where tk.id = p_ticket_id and t.user_id = auth.uid();
  if k.id is null then raise exception 'Senha não encontrada.'; end if;
  if k.status = 'waiting' then
    select count(*) into n from public.tickets where tickets.status = 'waiting' and created_at < k.created_at;
  end if;
  select s.avg_minutes into m from public.settings s where s.id = 1;
  return query select k.code, k.status, k.service, k.animal_name, n, coalesce(m, 15);
end $$;

CREATE OR REPLACE FUNCTION public.cancel_my_ticket(p_ticket_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare n int;
begin
  update public.tickets tk set status = 'cancelled', finished_at = now()
    from public.tutors t
    where tk.id = p_ticket_id and t.id = tk.tutor_id and t.user_id = auth.uid() and tk.status = 'waiting';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Só é possível cancelar uma senha sua que ainda esteja aguardando.'; end if;
  return true;
end $$;

CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from public.user_roles where role = 'admin')
$$;

CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if auth.uid() is null then raise exception 'Faça login primeiro.'; end if;
  perform pg_advisory_xact_lock(hashtext('claim-first-admin'));
  if exists (select 1 from public.user_roles where role = 'admin') then
    raise exception 'Já existe um administrador.';
  end if;
  insert into public.user_roles(user_id, role) values (auth.uid(), 'admin');
  return true;
end $$;

REVOKE EXECUTE ON FUNCTION public.create_ticket(uuid,text), public.get_my_ticket_status(uuid),
  public.cancel_my_ticket(uuid), public.claim_first_admin(), public.admin_exists(),
  public.is_staff_or_admin(uuid), public.owns_tutor(uuid), public.next_ticket_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_ticket(uuid,text), public.get_my_ticket_status(uuid),
  public.cancel_my_ticket(uuid), public.claim_first_admin(), public.admin_exists(),
  public.is_staff_or_admin(uuid), public.owns_tutor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_exists() TO anon;
GRANT EXECUTE ON FUNCTION public.next_ticket_code(text) TO service_role;

-- storage
DROP POLICY IF EXISTS "staff read documents" ON storage.objects;
CREATE POLICY "docs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_staff_or_admin(auth.uid())));
CREATE POLICY "docs insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_staff_or_admin(auth.uid())));
CREATE POLICY "docs update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documents' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_staff_or_admin(auth.uid())))
  WITH CHECK (bucket_id = 'documents' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_staff_or_admin(auth.uid())));
CREATE POLICY "docs admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND public.has_role(auth.uid(), 'admin'));
