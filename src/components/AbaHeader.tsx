import { PawPrint, Stethoscope } from "lucide-react";
import type { ReactNode } from "react";

export function AbaHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="bg-hero text-primary-foreground">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-foreground/15">
          <PawPrint className="h-7 w-7" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg leading-tight sm:text-2xl">
            ABA - Amigos Barretenses dos Animais
          </h1>
          <p className="flex items-center gap-1.5 text-xs opacity-90 sm:text-sm">
            <Stethoscope className="h-3.5 w-3.5" aria-hidden />
            Atendimento Veterinário, Castração e Vacinação
          </p>
        </div>
        {right}
      </div>
    </header>
  );
}
