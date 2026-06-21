import path from "node:path";

export const LARGURA_GRADE = 4320;
export const ALTURA_GRADE = 2160;
export const RESOLUCAO_POR_GRAU = 12;
export const TAMANHO_ESPERADO_ARQUIVO = LARGURA_GRADE * ALTURA_GRADE;
export const VALOR_SEM_DADO = 255;
export const FATOR_ALTITUDE_METROS = 20;
export const RESOLUCAO_FONTE_METROS_APROXIMADA = 10000;

export function obterCaminhoArquivoAltitude(): string {
  return (
    process.env.CAMINHO_ARQUIVO_ALTITUDE ??
    path.resolve(process.cwd(), "servidor", "dados", "data10k8b.raw")
  );
}

export function obterFonteElevacao(): "raw" {
  const fonte = process.env.FONTE_ELEVACAO ?? "raw";
  return fonte === "raw" ? "raw" : "raw";
}

export function obterMetodoInterpolacao(): "bilinear" {
  const metodo = process.env.METODO_INTERPOLACAO ?? "bilinear";
  return metodo === "bilinear" ? "bilinear" : "bilinear";
}

export function obterPortaServidor(): number {
  const porta = Number(process.env.PORTA_API ?? 3333);
  return Number.isFinite(porta) && porta > 0 ? porta : 3333;
}

export function obterPerfilIntervaloPadraoMetros(): number {
  const intervalo = Number(process.env.PERFIL_INTERVALO_PADRAO_METROS ?? 50);
  return Number.isFinite(intervalo) && intervalo > 0 ? intervalo : 50;
}

export function obterPerfilIntervaloMinimoMetros(): number {
  const intervalo = Number(process.env.PERFIL_INTERVALO_MINIMO_METROS ?? 5);
  return Number.isFinite(intervalo) && intervalo > 0 ? intervalo : 5;
}

export function obterPerfilLimiteAmostras(): number {
  const limite = Number(process.env.PERFIL_LIMITE_AMOSTRAS ?? 3000);
  return Number.isInteger(limite) && limite >= 2 ? limite : 3000;
}
