import path from "node:path";

export const LARGURA_GRADE = 4320;
export const ALTURA_GRADE = 2160;
export const RESOLUCAO_POR_GRAU = 12;
export const TAMANHO_ESPERADO_ARQUIVO = LARGURA_GRADE * ALTURA_GRADE;
export const VALOR_SEM_DADO = 255;
export const FATOR_ALTITUDE_METROS = 20;

export function obterCaminhoArquivoAltitude(): string {
  return (
    process.env.CAMINHO_ARQUIVO_ALTITUDE ??
    path.resolve(process.cwd(), "servidor", "dados", "data10k8b.raw")
  );
}

export function obterPortaServidor(): number {
  const porta = Number(process.env.PORTA_API ?? 3333);
  return Number.isFinite(porta) && porta > 0 ? porta : 3333;
}
