import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BellRing, CheckCircle2, Clock, Loader2, Users, XCircle } from "lucide-react";
import { z } from "zod";
import { AbaHeader } from "@/components/AbaHeader";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cancelTicket, getTicketStatus } from "@/lib/tickets.functions";
import { SERVICES, estimateWait, type Service } from "@/lib/queue";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/senha/$id")({
  validateSearch: z.object({ t: z.string().catch("") }),
  head: () => ({
    meta: [
      { title: "Minha senha — ABA Barretos" },
      { name: "description", content: "Acompanhe sua posição na fila de atendimento da ABA em tempo real." },
      { property: "og:title", content: "Minha senha — ABA Barretos" },
      { property: "og:description", content: "Acompanhe sua posição na fila de atendimento da ABA." },
      { name: "robots", content: "noindex" },
    ],
  }),
  ssr: false,
  component: SenhaPage,
});

function SenhaPage() {
  const { id } = Route.useParams();
  const { t } = Route.useSearch();
  const navigate = useNavigate();
  const fetchStatus = useServerFn(getTicketStatus);
  const cancel = useServerFn(cancelTicket);
  const [cancelling, setCancelling] = useState(false);

  const q = useQuery({
    queryKey: ["ticket", id, t],
    queryFn: () => fetchStatus({ data: { id, token: t } }),
    refetchInterval: 5000,
  });

  const newTicket = () => {
    localStorage.removeItem("aba-ticket");
    navigate({ to: "/" });
  };

  if (q.isLoading) return <Shell><Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /></Shell>;
  const d = q.data;
  if (!d) return (
    <Shell>
      <p className="text-center">Senha não encontrada.</p>
      <Button onClick={newTicket} className="mx-auto mt-4 block">Retirar nova senha</Button>
    </Shell>
  );

  const called = d.status === "called";
  const waiting = d.status === "waiting";
  const finished = !waiting && !called;
  const statusText = waiting ? "Aguardando na fila" : called ? "É a sua vez! Dirija-se ao guichê/consultório"
    : d.status === "done" ? "Atendimento Finalizado" : d.status === "cancelled" ? "Senha cancelada" : "Não compareceu";

  return (
    <Shell>
      <div className={cn("rounded-[2rem] border-4 bg-card p-6 text-center shadow-soft transition",
        called ? "animate-called border-success" : "border-transparent")}>
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Sua senha</p>
        <p className="my-2 font-display text-6xl font-bold tracking-tight text-primary sm:text-7xl">{d.code}</p>
        <p className="text-muted-foreground">{SERVICES[d.service as Service].label} · {d.animal_name}</p>

        <div className={cn("mt-5 flex items-center justify-center gap-2 rounded-2xl p-4 text-lg font-semibold",
          called ? "bg-success text-success-foreground" : waiting ? "bg-secondary text-secondary-foreground" : "bg-muted")}
          role="status" aria-live="polite">
          {called ? <BellRing className="h-6 w-6" /> : waiting ? <Clock className="h-6 w-6" /> : d.status === "done" ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
          {statusText}
        </div>

        {waiting && (
          <div className="mt-4 grid grid-cols-2 gap-3 text-left">
            <div className="rounded-2xl bg-muted p-4">
              <Users className="mb-1 h-5 w-5 text-primary" />
              <p className="text-sm text-muted-foreground">Posição na fila</p>
              <p className="font-semibold">{d.ahead === 0 ? "Você é o próximo!" : `Há ${d.ahead} ${d.ahead === 1 ? "pessoa" : "pessoas"} na sua frente`}</p>
            </div>
            <div className="rounded-2xl bg-muted p-4">
              <Clock className="mb-1 h-5 w-5 text-primary" />
              <p className="text-sm text-muted-foreground">Tempo estimado</p>
              <p className="font-semibold">~{estimateWait(d.ahead, d.avgMinutes)} min</p>
            </div>
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">Esta tela se atualiza sozinha. Mantenha-a aberta.</p>

      <div className="mt-6 grid gap-3">
        {waiting && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="h-12 rounded-2xl border-destructive/40 text-destructive">Desistir da senha</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancelar sua senha?</AlertDialogTitle>
                <AlertDialogDescription>Você sairá da fila e precisará fazer um novo cadastro para voltar.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction disabled={cancelling} onClick={async () => {
                  setCancelling(true);
                  await cancel({ data: { id, token: t } });
                  await q.refetch();
                  setCancelling(false);
                }}>Sim, cancelar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {finished && <Button onClick={newTicket} className="h-12 rounded-2xl">Retirar nova senha</Button>}
        <Link to="/" className="text-center text-sm text-muted-foreground underline">Voltar ao início</Link>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AbaHeader />
      <main className="mx-auto max-w-md px-4 py-8">{children}</main>
    </div>
  );
}
