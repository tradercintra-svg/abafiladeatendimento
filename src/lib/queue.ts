export type Service = "consulta" | "castracao" | "vacinacao" | "retorno";
export type Species = "cao" | "gato";
export type TicketStatus = "waiting" | "called" | "done" | "no_show" | "cancelled";

export const SERVICES: Record<Service, { label: string; prefix: string }> = {
  consulta: { label: "Consulta Veterinária", prefix: "VET" },
  castracao: { label: "Castração Agendada", prefix: "CAS" },
  vacinacao: { label: "Vacinação - Parvovirose/Cinomose", prefix: "VAC" },
  retorno: { label: "Pós-operatório/Retorno", prefix: "RET" },
};
export const SPECIES: Record<Species, string> = { cao: "Cão", gato: "Gato" };

export const DEFAULT_AVG_MINUTES = 15;

/** Estimated wait in minutes: people ahead × average minutes per attendance. */
export function estimateWait(ahead: number, avgMinutes: number): number {
  return Math.max(0, ahead) * Math.max(1, avgMinutes);
}

export function onlyDigits(v: string) {
  return v.replace(/\D/g, "");
}

export function maskCpf(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
export function maskPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}
export function maskCep(v: string) {
  return onlyDigits(v).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
}

/** Validates CPF format and check digits. */
export function isValidCpf(v: string): boolean {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
