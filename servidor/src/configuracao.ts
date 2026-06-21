export const CURVAS_RESOLUCAO_MINIMA_METROS = 50;
export const CURVAS_RESOLUCAO_PADRAO_METROS = 100;
export const CURVAS_LIMITE_PONTOS_API = 5000;
export const CURVAS_FATOR_DENSIFICACAO = 4;
export const CURVAS_LIMITE_NOS_DENSIFICADOS = 300000;

const OPEN_ELEVATION_CACHE_TTL_PADRAO_MS = 24 * 60 * 60 * 1000;
const OPEN_ELEVATION_CACHE_MAX_PADRAO = 20000;
const OPEN_ELEVATION_TAMANHO_LOTE_PADRAO = 400;
const OPEN_ELEVATION_TIMEOUT_PADRAO_MS = 20000;
const OPEN_ELEVATION_CONCORRENCIA_PADRAO = 2;

function obterNumeroAmbiente(nome: string, fallback: number, minimo: number): number {
  const valor = Number(process.env[nome] ?? fallback);
  return Number.isFinite(valor) ? Math.max(minimo, valor) : fallback;
}

export function obterPortaServidor(): number {
  const porta = Number(process.env.PORTA_API ?? 3333);
  return Number.isFinite(porta) && porta > 0 ? porta : 3333;
}

export function obterOpenElevationCacheTtlMs(): number {
  return obterNumeroAmbiente("OPEN_ELEVATION_CACHE_TTL_MS", OPEN_ELEVATION_CACHE_TTL_PADRAO_MS, 1000);
}

export function obterOpenElevationCacheMaxItens(): number {
  return obterNumeroAmbiente("OPEN_ELEVATION_CACHE_MAX_ITENS", OPEN_ELEVATION_CACHE_MAX_PADRAO, 1);
}

export function obterOpenElevationTamanhoLote(): number {
  return obterNumeroAmbiente("OPEN_ELEVATION_TAMANHO_LOTE", OPEN_ELEVATION_TAMANHO_LOTE_PADRAO, 1);
}

export function obterOpenElevationTimeoutMs(): number {
  return obterNumeroAmbiente("OPEN_ELEVATION_TIMEOUT_MS", OPEN_ELEVATION_TIMEOUT_PADRAO_MS, 1000);
}

export function obterOpenElevationMaxConcorrencia(): number {
  return obterNumeroAmbiente("OPEN_ELEVATION_MAX_CONCORRENCIA", OPEN_ELEVATION_CONCORRENCIA_PADRAO, 1);
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
