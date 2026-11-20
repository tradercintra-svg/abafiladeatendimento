import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { Camera, Cat, Dog, FileText, ImagePlus, Loader2, Ticket } from "lucide-react";
import { toast } from "sonner";
import { AbaHeader } from "@/components/AbaHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createTicket } from "@/lib/tickets.functions";
import { SERVICES, isValidCpf, maskCep, maskCpf, maskPhone, type Service } from "@/lib/queue";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Retirar senha — ABA Barretos" },
      { name: "description", content: "Cadastre-se e retire sua senha para atendimento veterinário, castração ou vacinação na ABA." },
      { property: "og:title", content: "Retirar senha — ABA Barretos" },
      { property: "og:description", content: "Cadastre-se e retire sua senha de atendimento na ABA - Amigos Barretenses dos Animais." },
    ],
  }),
  component: Cadastro,
});

const STORAGE_KEY = "aba-ticket";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border bg-card p-5 shadow-soft sm:p-6">
      <h2 className="mb-4 font-display text-lg text-primary">{title}</h2>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function Cadastro() {
  const navigate = useNavigate();
  const submit = useServerFn(createTicket);
  const [f, setF] = useState({
    tutor_name: "", cpf: "", phone: "", cep: "", street: "", number: "", neighborhood: "",
    animal_name: "", species: "cao", service: "consulta" as Service,
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ id: string; token: string } | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v) setSaved(JSON.parse(v));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value;
    if (k === "cpf") v = maskCpf(v);
    if (k === "phone") v = maskPhone(v);
    if (k === "cep") v = maskCep(v);
    setF((p) => ({ ...p, [k]: v }));
  };

  const pick = (fl: File | undefined) => {
    if (!fl) return;
    if (fl.size > 10 * 1024 * 1024) { toast.error("Arquivo maior que 10 MB"); return; }
    setFile(fl);
    setPreview(fl.type.startsWith("image/") ? URL.createObjectURL(fl) : null);
  };

  const cpfInvalid = f.cpf.length === 14 && !isValidCpf(f.cpf);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValidCpf(f.cpf)) return toast.error("Informe um CPF válido");
    if (f.phone.length < 14) return toast.error("Informe um telefone válido");
    if (f.cep.length !== 9) return toast.error("Informe um CEP válido");
    if (!file) return toast.error("Anexe a foto do RG ou CNH");
    if (!declared) return toast.error("Confirme a declaração para continuar");
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, v));
      fd.append("declaration", "true");
      fd.append("document", file);
      const res = await submit({ data: fd });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(res));
      navigate({ to: "/senha/$id", params: { id: res.id }, search: { t: res.token } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar a senha");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AbaHeader />
      <main className="mx-auto max-w-2xl px-4 py-6">
        {saved && (
          <button
            onClick={() => navigate({ to: "/senha/$id", params: { id: saved.id }, search: { t: saved.token } })}
            className="mb-5 flex w-full items-center gap-3 rounded-2xl bg-secondary p-4 text-left text-secondary-foreground"
          >
            <Ticket className="h-6 w-6" />
            <span className="flex-1 font-medium">Você já tem uma senha. Toque para acompanhar.</span>
          </button>
        )}
        <p className="mb-5 text-muted-foreground">
          Olá! Preencha o cadastro abaixo para retirar sua senha de atendimento. Todos os campos são obrigatórios.
        </p>
        <form onSubmit={onSubmit} className="grid gap-5">
          <Section title="Dados do tutor">
            <Field label="Nome completo" id="tutor_name">
              <Input id="tutor_name" required value={f.tutor_name} onChange={set("tutor_name")} autoComplete="name" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="CPF" id="cpf" error={cpfInvalid ? "CPF inválido" : undefined}>
                <Input id="cpf" required inputMode="numeric" placeholder="000.000.000-00" value={f.cpf} onChange={set("cpf")} aria-invalid={cpfInvalid} />
              </Field>
              <Field label="Telefone / WhatsApp" id="phone">
                <Input id="phone" required inputMode="tel" placeholder="(17) 99999-9999" value={f.phone} onChange={set("phone")} autoComplete="tel" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
              <Field label="CEP" id="cep">
                <Input id="cep" required inputMode="numeric" placeholder="14780-000" value={f.cep} onChange={set("cep")} />
              </Field>
              <Field label="Rua" id="street">
                <Input id="street" required value={f.street} onChange={set("street")} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
              <Field label="Número" id="number">
                <Input id="number" required value={f.number} onChange={set("number")} />
              </Field>
              <Field label="Bairro" id="neighborhood">
                <Input id="neighborhood" required value={f.neighborhood} onChange={set("neighborhood")} />
              </Field>
            </div>
            <p className="text-sm text-muted-foreground">Cidade: Barretos / SP</p>
          </Section>

          <Section title="Documento com foto (RG ou CNH)">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 p-4 font-medium text-primary hover:bg-muted">
                <Camera className="h-5 w-5" /> Tirar foto
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
              </label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 p-4 font-medium text-primary hover:bg-muted">
                <ImagePlus className="h-5 w-5" /> Escolher arquivo
                <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
              </label>
            </div>
            {file && (
              <div className="overflow-hidden rounded-2xl border bg-muted">
                {preview ? (
                  <img src={preview} alt="Pré-visualização do documento" className="max-h-72 w-full object-contain" />
                ) : (
                  <div className="flex items-center gap-2 p-4"><FileText className="h-5 w-5" /> {file.name}</div>
                )}
              </div>
            )}
          </Section>

          <Section title="Animal e serviço">
            <Field label="Nome do animal" id="animal_name">
              <Input id="animal_name" required value={f.animal_name} onChange={set("animal_name")} />
            </Field>
            <div>
              <Label className="mb-2 block">Espécie</Label>
              <div className="grid grid-cols-2 gap-3">
                {([["cao", "Cão", Dog], ["gato", "Gato", Cat]] as const).map(([v, l, Icon]) => (
                  <button type="button" key={v} onClick={() => setF((p) => ({ ...p, species: v }))}
                    className={cn("flex items-center justify-center gap-2 rounded-2xl border-2 p-4 font-semibold transition",
                      f.species === v ? "border-primary bg-secondary text-secondary-foreground" : "border-border")}
                    aria-pressed={f.species === v}>
                    <Icon className="h-6 w-6" /> {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Tipo de atendimento</Label>
              <RadioGroup value={f.service} onValueChange={(v) => setF((p) => ({ ...p, service: v as Service }))} className="grid gap-2">
                {(Object.keys(SERVICES) as Service[]).map((s) => (
                  <label key={s} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3",
                    f.service === s && "border-primary bg-secondary/60")}>
                    <RadioGroupItem value={s} /> {SERVICES[s].label}
                  </label>
                ))}
              </RadioGroup>
            </div>
          </Section>

          <label className="flex items-start gap-3 rounded-2xl bg-muted p-4">
            <Checkbox checked={declared} onCheckedChange={(v) => setDeclared(v === true)} className="mt-0.5" />
            <span className="text-sm">Declaro que as informações são verdadeiras e que resido em Barretos-SP.</span>
          </label>

          <Button type="submit" size="lg" disabled={busy} className="h-14 rounded-2xl text-lg">
            {busy ? <Loader2 className="animate-spin" /> : <Ticket />} Gerar minha senha
          </Button>
        </form>
      </main>
    </div>
  );
}

function Field({ label, id, error, children }: { label: string; id: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
