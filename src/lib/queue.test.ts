import { describe, expect, it } from "vitest";
import { estimateWait, isValidCpf, SERVICES } from "./queue";

describe("regras da fila", () => {
  it("estima 15 min por pessoa na frente", () => {
    expect(estimateWait(3, 15)).toBe(45);
    expect(estimateWait(0, 15)).toBe(0);
  });
  it("valida CPF", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123.456.789-00")).toBe(false);
  });
  it("prefixos de senha", () => {
    expect(SERVICES.consulta.prefix).toBe("VET");
    expect(SERVICES.vacinacao.prefix).toBe("VAC");
    expect(SERVICES.castracao.prefix).toBe("CAS");
  });
});
