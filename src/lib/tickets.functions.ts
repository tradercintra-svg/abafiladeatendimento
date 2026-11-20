import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isValidCpf } from "./queue";

const fieldsSchema = z.object({
  tutor_name: z.string().trim().min(3).max(120),
  cpf: z.string().trim().refine(isValidCpf, "CPF inválido"),
  phone: z.string().trim().min(14).max(16),
  cep: z.string().trim().regex(/^\d{5}-\d{3}$/),
  street: z.string().trim().min(2).max(120),
  number: z.string().trim().min(1).max(10),
  neighborhood: z.string().trim().min(2).max(80),
  animal_name: z.string().trim().min(1).max(60),
  species: z.enum(["cao", "gato"]),
  service: z.enum(["consulta", "castracao", "vacinacao", "retorno"]),
  declaration: z.literal("true"),
});

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

export const createTicket = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => {
    if (!(data instanceof FormData)) throw new Error("Dados inválidos");
    const obj = Object.fromEntries(
      [...data.entries()].filter(([, v]) => typeof v === "string"),
    );
    const fields = fieldsSchema.parse(obj);
    const file = data.get("document");
    if (!(file instanceof File) || file.size === 0) throw new Error("Anexe o documento com foto");
    if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo maior que 10 MB");
    if (!ALLOWED.includes(file.type)) throw new Error("Envie uma foto ou PDF");
    return { fields, file };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fields, file } = data;
    const ext = file.type === "application/pdf" ? "pdf" : (file.type.split("/")[1] ?? "jpg");
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    const up = await supabaseAdmin.storage
      .from("documents")
      .upload(path, await file.arrayBuffer(), { contentType: file.type });
    if (up.error) throw new Error("Falha ao enviar o documento");

    const { data: code, error: codeErr } = await supabaseAdmin.rpc("next_ticket_code", {
      _service: fields.service,
    });
    if (codeErr || !code) throw new Error("Falha ao gerar senha");

    const { declaration: _d, ...rest } = fields;
    const { data: row, error } = await supabaseAdmin
      .from("tickets")
      .insert({ ...rest, code, doc_path: path })
      .select("id, access_token")
      .single();
    if (error || !row) throw new Error("Falha ao registrar na fila");
    return { id: row.id, token: row.access_token };
  });

const refSchema = z.object({ id: z.string().uuid(), token: z.string().uuid() });

export const getTicketStatus = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => refSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin
      .from("tickets")
      .select("code, status, service, animal_name, created_at")
      .eq("id", data.id)
      .eq("access_token", data.token)
      .maybeSingle();
    if (!t) return null;
    let ahead = 0;
    if (t.status === "waiting") {
      const { count } = await supabaseAdmin
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "waiting")
        .lt("created_at", t.created_at);
      ahead = count ?? 0;
    }
    const { data: s } = await supabaseAdmin.from("settings").select("avg_minutes").eq("id", 1).single();
    return { ...t, ahead, avgMinutes: s?.avg_minutes ?? 15 };
  });

export const cancelTicket = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => refSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("tickets")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("access_token", data.token)
      .eq("status", "waiting");
    return { ok: true };
  });
