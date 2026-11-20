import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  BellRing, Cat, CheckCircle2, Clock, Dog, ExternalLink, FileText, Loader2, LogOut, PawPrint,
  Printer, QrCode, Settings, UserX, Users, Activity,
} from "lucide-react";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { AbaHeader } from "@/components/AbaHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SERVICES, SPECIES, type Service, type Species } from "@/lib/queue";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Painel da Equipe — ABA Barretos" },
      { name: "description", content: "Painel de recepção da ABA para chamar senhas e conferir documentos." },
      { property: "og:title", content: "Painel da Equipe — ABA Barretos" },
      { property: "og:description", content: "Painel de recepção e controle de fila da ABA." },
      { name: "robots", content: "noindex" },
    ],
  }),
  ssr: false,
  component: AdminPage,
});

type Ticket = Tables<"tickets">;

function AdminPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <Center><Loader2 className="h-8 w-8 animate-spin text-primary" /></Center>;
  if (!session) return <Login />;
  return <StaffGate userId={session.user.id} email={session.user.email ?? ""} />;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background"><AbaHeader /><div className="flex justify-center px-4 py-12">{children}</div></div>;
}

function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error, data } = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/admin` } });
    setBusy(false);
    if (error) return toast.error(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos" : error.message);
    if (mode === "up" && !data.session) toast.success("Conta criada! Confirme pelo link enviado ao seu e-mail.");
  }
  return (
    <Center>
      <form onSubmit={onSubmit} className="grid w-full max-w-sm gap-4 rounded-3xl border bg-card p-6 shadow-soft">
        <h2 className="font-display text-2xl text-primary">{mode === "in" ? "Acesso da equipe" : "Criar conta da equipe"}</h2>
        <div className="grid gap-1.5"><Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="grid gap-1.5"><Label htmlFor="pw">Senha</Label>
          <Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <Button type="submit" disabled={busy} className="h-11 rounded-xl">{busy && <Loader2 className="animate-spin" />}{mode === "in" ? "Entrar" : "Criar conta"}</Button>
        <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="text-sm text-muted-foreground underline">
          {mode === "in" ? "Primeiro acesso? Criar conta" : "Já tenho conta"}
        </button>
      </form>
    </Center>
  );
}

function SignOut() {
  const qc = useQueryClient();
  return (
    <Button variant="secondary" size="sm" onClick={async () => { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); }}>
      <LogOut /> <span className="hidden sm:inline">Sair</span>
    </Button>
  );
}

function StaffGate({ userId, email }: { userId: string; email: string }) {
  const role = useQuery({
    queryKey: ["role", userId],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "staff").maybeSingle();
      return !!data;
    },
  });
  if (role.isLoading) return <Center><Loader2 className="h-8 w-8 animate-spin text-primary" /></Center>;
  if (!role.data) return (
    <div className="min-h-screen bg-background"><AbaHeader right={<SignOut />} />
      <p className="mx-auto max-w-md px-4 py-12 text-center">A conta <b>{email}</b> ainda não tem acesso ao painel. Peça a um responsável da ABA para liberar seu acesso.</p>
    </div>
  );
  return <Panel />;
}

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); }
const fmtTime = (s: string) => new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function Panel() {
  const qc = useQueryClient();
  const tickets = useQuery({
    queryKey: ["tickets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tickets").select("*").gte("created_at", startOfToday()).order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("settings").select("avg_minutes").eq("id", 1).single()).data,
  });

  useEffect(() => {
    const ch = supabase.channel(`tickets-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => qc.invalidateQueries({ queryKey: ["tickets"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const [filter, setFilter] = useState<"all" | Service>("all");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const list = tickets.data ?? [];
  const waiting = list.filter((t) => t.status === "waiting");
  const inService = list.filter((t) => t.status === "called");
  const done = list.filter((t) => t.status === "done" && t.called_at && t.finished_at);
  const avgReal = useMemo(() => done.length
    ? Math.round(done.reduce((s, t) => s + (+new Date(t.finished_at!) - +new Date(t.called_at!)), 0) / done.length / 60000) : null, [done]);
  const total = list.filter((t) => t.status !== "cancelled").length;

  async function update(id: string, patch: Partial<Ticket>) {
    const { error } = await supabase.from("tickets").update(patch).eq("id", id);
    if (error) toast.error("Não foi possível atualizar");
    await qc.invalidateQueries({ queryKey: ["tickets"] });
  }

  async function callNext() {
    const next = waiting.find((t) => filter === "all" || t.service === filter);
    if (!next) return toast.info("Nenhuma senha aguardando" + (filter === "all" ? "" : " para este serviço"));
    setBusy(true);
    await update(next.id, { status: "called", called_at: new Date().toISOString() });
    setBusy(false);
    toast.success(`Senha ${next.code} chamada`);
  }

  return (
    <div className="min-h-screen bg-background">
      <AbaHeader right={<div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setQrOpen(true)}><QrCode /> <span className="hidden sm:inline">QR Code</span></Button>
        <SignOut />
      </div>} />
      <main className="mx-auto grid max-w-5xl gap-5 px-4 py-6">
        <div className="grid grid-cols-3 gap-3">
          <Stat icon={<Activity />} label="Atendimentos hoje" value={total} />
          <Stat icon={<Users />} label="Aguardando agora" value={waiting.length} />
          <Stat icon={<Clock />} label="Tempo médio real" value={avgReal == null ? "—" : `${avgReal} min`} />
        </div>

        <section className="rounded-3xl bg-hero p-5 text-primary-foreground shadow-soft sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="h-14 border-primary-foreground/30 bg-primary-foreground/10 sm:w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ordem de chegada (todos)</SelectItem>
                {(Object.keys(SERVICES) as Service[]).map((s) => <SelectItem key={s} value={s}>{SERVICES[s].label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={callNext} disabled={busy} className="h-14 flex-1 rounded-2xl bg-success text-lg font-bold text-success-foreground hover:bg-success/90">
              <BellRing className="size-6" /> Chamar Próxima Senha
            </Button>
          </div>
          <div className="mt-5 grid gap-3">
            {inService.length === 0 && <p className="text-center opacity-80">Nenhuma senha em atendimento no momento.</p>}
            {inService.map((t) => (
              <div key={t.id} className="flex flex-col gap-3 rounded-2xl bg-card p-4 text-card-foreground sm:flex-row sm:items-center">
                <button onClick={() => setSelected(t)} className="flex-1 text-left">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Em atendimento</p>
                  <p className="font-display text-4xl font-bold text-primary">{t.code}</p>
                  <p className="text-sm">{t.tutor_name} · {t.animal_name} ({SPECIES[t.species as Species]})</p>
                </button>
                <div className="flex gap-2">
                  <Button onClick={() => update(t.id, { status: "done", finished_at: new Date().toISOString() })} className="flex-1"><CheckCircle2 /> Finalizar Atendimento</Button>
                  <Button variant="outline" onClick={() => update(t.id, { status: "no_show", finished_at: new Date().toISOString() })} className="flex-1"><UserX /> Não Compareceu</Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-4 shadow-soft sm:p-6">
          <h2 className="mb-3 font-display text-xl text-primary">Fila ({waiting.length})</h2>
          {tickets.isLoading ? <Loader2 className="mx-auto animate-spin" /> : waiting.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">Fila vazia.</p>
          ) : (
            <ul className="divide-y">
              {waiting.map((t, i) => (
                <li key={t.id}>
                  <button onClick={() => setSelected(t)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-muted/60 sm:px-2">
                    <span className="w-6 text-sm text-muted-foreground">{i + 1}º</span>
                    <span className="w-20 font-display text-lg font-bold text-primary">{t.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{t.tutor_name}</span>
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        {t.species === "gato" ? <Cat className="size-4" /> : <Dog className="size-4" />} {t.animal_name} · {SERVICES[t.service as Service].label}
                      </span>
                    </span>
                    <span className="text-sm text-muted-foreground">{fmtTime(t.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <SettingsCard current={settings.data?.avg_minutes ?? 15} onSaved={() => qc.invalidateQueries({ queryKey: ["settings"] })} />
      </main>

      <TicketDialog ticket={selected} onClose={() => setSelected(null)} />
      <QrDialog open={qrOpen} onOpenChange={setQrOpen} />
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-3xl border bg-card p-3 shadow-soft sm:p-5">
      <div className="mb-1 text-primary [&_svg]:size-5">{icon}</div>
      <p className="font-display text-2xl font-bold sm:text-3xl">{value}</p>
      <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
    </div>
  );
}

function SettingsCard({ current, onSaved }: { current: number; onSaved: () => void }) {
  const [v, setV] = useState(String(current));
  useEffect(() => setV(String(current)), [current]);
  async function save() {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 180) return toast.error("Informe entre 1 e 180 minutos");
    const { error } = await supabase.from("settings").update({ avg_minutes: n }).eq("id", 1);
    if (error) return toast.error("Não foi possível salvar");
    toast.success("Tempo médio atualizado");
    onSaved();
  }
  return (
    <section className="rounded-3xl border bg-card p-4 shadow-soft sm:p-6">
      <h2 className="mb-3 flex items-center gap-2 font-display text-xl text-primary"><Settings className="size-5" /> Configurações rápidas</h2>
      <Label htmlFor="avg">Tempo médio estimado por atendimento (minutos)</Label>
      <div className="mt-1.5 flex gap-2">
        <Input id="avg" type="number" min={1} max={180} value={v} onChange={(e) => setV(e.target.value)} className="max-w-32" />
        <Button onClick={save}>Salvar</Button>
      </div>
    </section>
  );
}

function TicketDialog({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
  const doc = useQuery({
    queryKey: ["doc", ticket?.doc_path],
    enabled: !!ticket?.doc_path,
    queryFn: async () => (await supabase.storage.from("documents").createSignedUrl(ticket!.doc_path!, 600)).data?.signedUrl ?? null,
  });
  const [zoom, setZoom] = useState(false);
  const isPdf = ticket?.doc_path?.endsWith(".pdf");
  return (
    <Dialog open={!!ticket} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {ticket && <>
          <DialogHeader><DialogTitle className="font-display text-3xl text-primary">{ticket.code}</DialogTitle></DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Tutor</dt><dd className="font-medium">{ticket.tutor_name}</dd>
            <dt className="text-muted-foreground">CPF</dt><dd>{ticket.cpf}</dd>
            <dt className="text-muted-foreground">Telefone</dt><dd>{ticket.phone}</dd>
            <dt className="text-muted-foreground">Endereço</dt><dd>{ticket.street}, {ticket.number} — {ticket.neighborhood}, Barretos/SP · CEP {ticket.cep}</dd>
            <dt className="text-muted-foreground">Animal</dt><dd>{ticket.animal_name} ({SPECIES[ticket.species as Species]})</dd>
            <dt className="text-muted-foreground">Serviço</dt><dd>{SERVICES[ticket.service as Service].label}</dd>
            <dt className="text-muted-foreground">Entrada</dt><dd>{fmtTime(ticket.created_at)} <Badge variant="secondary" className="ml-1">{ticket.status === "waiting" ? "Aguardando" : ticket.status === "called" ? "Em atendimento" : ticket.status}</Badge></dd>
          </dl>
          <div>
            <p className="mb-2 text-sm font-semibold">Documento com foto</p>
            {!ticket.doc_path ? (
              <div className="flex items-center gap-2 rounded-2xl bg-muted p-4 text-sm text-muted-foreground"><PawPrint className="size-5" /> Cadastro de exemplo — sem documento anexado.</div>
            ) : doc.isLoading ? <Loader2 className="animate-spin" /> : !doc.data ? <p className="text-sm text-destructive">Não foi possível abrir o documento.</p>
              : isPdf ? (
                <Button asChild variant="outline"><a href={doc.data} target="_blank" rel="noreferrer"><FileText /> Abrir PDF <ExternalLink /></a></Button>
              ) : (
                <>
                  <button onClick={() => setZoom(true)} className="block w-full overflow-hidden rounded-2xl border bg-muted">
                    <img src={doc.data} alt="Documento do tutor" className="max-h-64 w-full object-contain" />
                  </button>
                  <p className="mt-1 text-xs text-muted-foreground">Toque na imagem para ampliar.</p>
                  <Dialog open={zoom} onOpenChange={setZoom}>
                    <DialogContent className="max-w-5xl p-2">
                      <DialogHeader className="sr-only"><DialogTitle>Documento ampliado</DialogTitle></DialogHeader>
                      <img src={doc.data} alt="Documento ampliado" className="max-h-[85vh] w-full object-contain" />
                    </DialogContent>
                  </Dialog>
                </>
              )}
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}

function QrDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const url = typeof window !== "undefined" ? window.location.origin + "/" : "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="no-print"><DialogTitle>QR Code da Recepção</DialogTitle></DialogHeader>
        <div id="qr-print" className="rounded-3xl bg-hero p-6 text-center text-primary-foreground">
          <PawPrint className="mx-auto size-10" />
          <p className="mt-2 font-display text-2xl">ABA - Amigos Barretenses dos Animais</p>
          <p className="text-sm opacity-90">Atendimento Veterinário, Castração e Vacinação</p>
          <div className="mx-auto my-5 w-fit rounded-2xl bg-card p-4">
            <QRCodeSVG value={url} size={220} fgColor="#1f4f5c" />
          </div>
          <p className="text-lg font-semibold">Aponte a câmera e retire sua senha</p>
          <p className="mt-1 break-all text-xs opacity-80">{url}</p>
        </div>
        <Button onClick={() => window.print()} className="no-print"><Printer /> Imprimir</Button>
      </DialogContent>
    </Dialog>
  );
}
