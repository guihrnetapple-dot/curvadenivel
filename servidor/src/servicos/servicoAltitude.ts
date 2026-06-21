import { readFile } from "node:fs/promises";

import {
  ALTURA_GRADE,
  FATOR_ALTITUDE_METROS,
  LARGURA_GRADE,
  RESOLUCAO_POR_GRAU,
  TAMANHO_ESPERADO_ARQUIVO,
  VALOR_SEM_DADO
} from "../configuracao";
import type { Coordenada, ResultadoAltitude } from "../tipos";
import { ErroAplicacao } from "../utilitarios/erros";

export class ServicoAltitude {
  private gradeAltitude: Uint8Array | null = null;
  private erroCarregamento: string | null = null;
  private promessaCarregamento: Promise<void> | null = null;

  constructor(private readonly caminhoArquivo: string) {}

  async carregarArquivo(): Promise<void> {
    if (this.promessaCarregamento) {
      return this.promessaCarregamento;
    }

    this.promessaCarregamento = this.executarCarregamento().finally(() => {
      this.promessaCarregamento = null;
    });

    return this.promessaCarregamento;
  }

  private async executarCarregamento(): Promise<void> {
    try {
      const arquivo = await readFile(this.caminhoArquivo);
      if (arquivo.length !== TAMANHO_ESPERADO_ARQUIVO) {
        throw new ErroAplicacao(
          `O arquivo data10k8b.raw tem ${arquivo.length} bytes, mas o esperado é ${TAMANHO_ESPERADO_ARQUIVO}.`,
          503
        );
      }

      this.gradeAltitude = arquivo;
      this.erroCarregamento = null;
    } catch (erro) {
      this.gradeAltitude = null;
      this.erroCarregamento =
        erro instanceof Error ? erro.message : "Falha desconhecida ao carregar o arquivo RAW.";
      if (erro instanceof ErroAplicacao) {
        throw erro;
      }
      throw new ErroAplicacao(
        `Não foi possível carregar data10k8b.raw: ${this.erroCarregamento}`,
        503
      );
    }
  }

  async garantirArquivoCarregado(): Promise<void> {
    if (!this.gradeAltitude) {
      await this.carregarArquivo();
    }
  }

  obterStatus() {
    return {
      arquivoCarregado: Boolean(this.gradeAltitude),
      caminhoArquivo: this.caminhoArquivo,
      tamanhoEsperado: TAMANHO_ESPERADO_ARQUIVO,
      tamanhoCarregado: this.gradeAltitude?.length ?? 0,
      erro: this.erroCarregamento
    };
  }

  async consultarPonto(coordenada: Coordenada): Promise<ResultadoAltitude> {
    await this.garantirArquivoCarregado();

    const latitude = Number(coordenada.latitude);
    const longitude = Number(coordenada.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new ErroAplicacao("Latitude e longitude devem ser números válidos.");
    }
    if (latitude < -90 || latitude > 90) {
      throw new ErroAplicacao("A latitude precisa estar entre -90 e 90.");
    }
    if (longitude < -180 || longitude > 180) {
      throw new ErroAplicacao("A longitude precisa estar entre -180 e 180.");
    }

    let coluna = Math.floor((longitude + 180) * RESOLUCAO_POR_GRAU);
    let linha = Math.floor((90 - latitude) * RESOLUCAO_POR_GRAU);

    if (coluna === LARGURA_GRADE && longitude === 180) {
      coluna = LARGURA_GRADE - 1;
    }
    if (linha === ALTURA_GRADE && latitude === -90) {
      linha = ALTURA_GRADE - 1;
    }

    if (coluna < 0 || coluna >= LARGURA_GRADE || linha < 0 || linha >= ALTURA_GRADE) {
      throw new ErroAplicacao("A coordenada está fora da cobertura da grade altimétrica.");
    }

    const indice = linha * LARGURA_GRADE + coluna;
    if (indice < 0 || indice >= TAMANHO_ESPERADO_ARQUIVO) {
      throw new ErroAplicacao("O índice calculado ficou fora do tamanho do arquivo RAW.");
    }

    const grade = this.gradeAltitude;
    if (!grade) {
      throw new ErroAplicacao("A grade altimétrica ainda não está disponível.", 503);
    }

    const valorBruto = grade[indice];
    if (valorBruto >= VALOR_SEM_DADO) {
      return {
        latitude,
        longitude,
        coluna,
        linha,
        indice,
        valorBruto,
        altitude: null,
        status: "sem_dado",
        mensagem: "Ponto classificado como água, área sem dado ou valor inválido.",
        consultadoEm: new Date().toISOString()
      };
    }

    return {
      latitude,
      longitude,
      coluna,
      linha,
      indice,
      valorBruto,
      altitude: valorBruto * FATOR_ALTITUDE_METROS,
      status: "valido",
      mensagem: "Altitude calculada com sucesso a partir da grade data10k8b.raw.",
      consultadoEm: new Date().toISOString()
    };
  }
}
