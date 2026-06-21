import type { ResultadoAltitude } from "../../tipos";
import type { EntradaCacheElevacao, EstatisticasCacheElevacao } from "./tiposElevacao";

export function criarChaveCacheElevacao(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

export class CacheElevacao {
  private readonly itens = new Map<string, EntradaCacheElevacao>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxItens: number
  ) {}

  obter(latitude: number, longitude: number, agora = Date.now()): ResultadoAltitude | null {
    const chave = criarChaveCacheElevacao(latitude, longitude);
    const entrada = this.itens.get(chave);

    if (!entrada) {
      return null;
    }

    if (agora - entrada.criadoEm > this.ttlMs) {
      this.itens.delete(chave);
      return null;
    }

    this.itens.delete(chave);
    this.itens.set(chave, entrada);
    return entrada.resultado;
  }

  definir(resultado: ResultadoAltitude, agora = Date.now()): void {
    const chave = criarChaveCacheElevacao(resultado.latitude, resultado.longitude);
    this.itens.set(chave, { resultado, criadoEm: agora });
    this.removerExcedentes();
  }

  obterEstatisticas(): EstatisticasCacheElevacao {
    return {
      itens: this.itens.size,
      maxItens: this.maxItens,
      ttlMs: this.ttlMs
    };
  }

  private removerExcedentes(): void {
    while (this.itens.size > this.maxItens) {
      const chaveMaisAntiga = this.itens.keys().next().value as string | undefined;
      if (!chaveMaisAntiga) {
        break;
      }
      this.itens.delete(chaveMaisAntiga);
    }
  }
}
