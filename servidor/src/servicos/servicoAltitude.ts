import { readFile } from "node:fs/promises";

import {
  ALTURA_GRADE,
  FATOR_ALTITUDE_METROS,
  LARGURA_GRADE,
  RESOLUCAO_FONTE_METROS_APROXIMADA,
  RESOLUCAO_POR_GRAU,
  TAMANHO_ESPERADO_ARQUIVO,
  VALOR_SEM_DADO
} from "../configuracao";
import type { Coordenada, ProvedorElevacao, ResultadoAltitude } from "../tipos";
import { ErroAplicacao } from "../utilitarios/erros";

const MENSAGEM_INTERPOLACAO =
  "Altitude estimada com interpolação bilinear a partir da grade data10k8b.raw. A fonte original possui baixa resolução espacial, portanto os decimais representam suavização matemática, não precisão topográfica real.";

interface CelulaGrade {
  coluna: number;
  linha: number;
  indice: number;
  valorBruto: number;
  valido: boolean;
}

interface AmostraInterpolada {
  coluna: number;
  linha: number;
  indice: number;
  valorBruto: number;
  valorBrutoInterpolado: number | null;
  altitude: number | null;
  status: "valido" | "sem_dado";
  metodo: "bilinear" | "bilinear_parcial";
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(Math.max(valor, minimo), maximo);
}

export class ProvedorRawInterpolado implements ProvedorElevacao {
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
    const amostra = this.amostrarGradeInterpolada(latitude, longitude);

    return {
      latitude,
      longitude,
      coluna: amostra.coluna,
      linha: amostra.linha,
      indice: amostra.indice,
      valorBruto: amostra.valorBruto,
      valorBrutoInterpolado: amostra.valorBrutoInterpolado ?? undefined,
      metodo: amostra.metodo,
      resolucaoFonteMetrosAproximada: RESOLUCAO_FONTE_METROS_APROXIMADA,
      precisaoReal: "baixa",
      avisoPrecisao:
        "Estimativa suavizada por interpolação matemática; a precisão real depende da resolução da fonte DEM.",
      altitude: amostra.altitude,
      status: amostra.status,
      mensagem:
        amostra.status === "valido"
          ? MENSAGEM_INTERPOLACAO
          : "Ponto classificado como água, área sem dado ou valor inválido na vizinhança da grade.",
      consultadoEm: new Date().toISOString()
    };
  }

  amostrarGradeInterpolada(latitude: number, longitude: number): AmostraInterpolada {
    this.validarCoordenada(latitude, longitude);
    const grade = this.obterGradeCarregada();

    const x = limitar((longitude + 180) * RESOLUCAO_POR_GRAU, 0, LARGURA_GRADE - 1);
    const y = limitar((90 - latitude) * RESOLUCAO_POR_GRAU, 0, ALTURA_GRADE - 1);

    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = limitar(x0 + 1, 0, LARGURA_GRADE - 1);
    const y1 = limitar(y0 + 1, 0, ALTURA_GRADE - 1);
    const tx = x - x0;
    const ty = y - y0;

    const q00 = this.lerCelula(grade, x0, y0);
    const q10 = this.lerCelula(grade, x1, y0);
    const q01 = this.lerCelula(grade, x0, y1);
    const q11 = this.lerCelula(grade, x1, y1);
    const vizinhos = [
      { celula: q00, peso: (1 - tx) * (1 - ty) },
      { celula: q10, peso: tx * (1 - ty) },
      { celula: q01, peso: (1 - tx) * ty },
      { celula: q11, peso: tx * ty }
    ];
    const validos = vizinhos.filter((vizinho) => vizinho.celula.valido);

    if (validos.length === 0) {
      return {
        coluna: q00.coluna,
        linha: q00.linha,
        indice: q00.indice,
        valorBruto: q00.valorBruto,
        valorBrutoInterpolado: null,
        altitude: null,
        status: "sem_dado",
        metodo: "bilinear_parcial"
      };
    }

    const somaPesos = validos.reduce((soma, vizinho) => soma + vizinho.peso, 0);
    const pesoNormalizador = somaPesos > 0 ? somaPesos : validos.length;
    const valorBrutoInterpolado =
      somaPesos > 0
        ? validos.reduce((soma, vizinho) => soma + vizinho.celula.valorBruto * vizinho.peso, 0) /
          pesoNormalizador
        : validos.reduce((soma, vizinho) => soma + vizinho.celula.valorBruto, 0) / validos.length;

    return {
      coluna: q00.coluna,
      linha: q00.linha,
      indice: q00.indice,
      valorBruto: q00.valorBruto,
      valorBrutoInterpolado,
      altitude: valorBrutoInterpolado * FATOR_ALTITUDE_METROS,
      status: "valido",
      metodo: validos.length === 4 ? "bilinear" : "bilinear_parcial"
    };
  }

  consultarPontoPorCelula(coordenada: Coordenada): ResultadoAltitude {
    const latitude = Number(coordenada.latitude);
    const longitude = Number(coordenada.longitude);
    this.validarCoordenada(latitude, longitude);
    const grade = this.obterGradeCarregada();

    const coluna = limitar(Math.floor((longitude + 180) * RESOLUCAO_POR_GRAU), 0, LARGURA_GRADE - 1);
    const linha = limitar(Math.floor((90 - latitude) * RESOLUCAO_POR_GRAU), 0, ALTURA_GRADE - 1);
    const celula = this.lerCelula(grade, coluna, linha);

    return {
      latitude,
      longitude,
      coluna,
      linha,
      indice: celula.indice,
      valorBruto: celula.valorBruto,
      metodo: "celula",
      resolucaoFonteMetrosAproximada: RESOLUCAO_FONTE_METROS_APROXIMADA,
      precisaoReal: "baixa",
      avisoPrecisao: "Leitura direta da célula da grade, sem suavização por interpolação.",
      altitude: celula.valido ? celula.valorBruto * FATOR_ALTITUDE_METROS : null,
      status: celula.valido ? "valido" : "sem_dado",
      mensagem: celula.valido
        ? "Altitude calculada por leitura direta da célula data10k8b.raw."
        : "Ponto classificado como água, área sem dado ou valor inválido.",
      consultadoEm: new Date().toISOString()
    };
  }

  private validarCoordenada(latitude: number, longitude: number): void {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new ErroAplicacao("Latitude e longitude devem ser números válidos.");
    }
    if (latitude < -90 || latitude > 90) {
      throw new ErroAplicacao("A latitude precisa estar entre -90 e 90.");
    }
    if (longitude < -180 || longitude > 180) {
      throw new ErroAplicacao("A longitude precisa estar entre -180 e 180.");
    }
  }

  private obterGradeCarregada(): Uint8Array {
    if (!this.gradeAltitude) {
      throw new ErroAplicacao("A grade altimétrica ainda não está disponível.", 503);
    }

    return this.gradeAltitude;
  }

  private lerCelula(grade: Uint8Array, coluna: number, linha: number): CelulaGrade {
    const colunaSegura = limitar(coluna, 0, LARGURA_GRADE - 1);
    const linhaSegura = limitar(linha, 0, ALTURA_GRADE - 1);
    const indice = linhaSegura * LARGURA_GRADE + colunaSegura;
    if (indice < 0 || indice >= TAMANHO_ESPERADO_ARQUIVO) {
      throw new ErroAplicacao("O índice calculado ficou fora do tamanho do arquivo RAW.");
    }

    const valorBruto = grade[indice];
    return {
      coluna: colunaSegura,
      linha: linhaSegura,
      indice,
      valorBruto,
      valido: valorBruto < VALOR_SEM_DADO
    };
  }
}

export class ServicoAltitude {
  private readonly provedor: ProvedorRawInterpolado;

  constructor(caminhoArquivo: string, provedor?: ProvedorRawInterpolado) {
    this.provedor = provedor ?? new ProvedorRawInterpolado(caminhoArquivo);
  }

  carregarArquivo(): Promise<void> {
    return this.provedor.carregarArquivo();
  }

  garantirArquivoCarregado(): Promise<void> {
    return this.provedor.garantirArquivoCarregado();
  }

  obterStatus() {
    return this.provedor.obterStatus();
  }

  consultarPonto(coordenada: Coordenada): Promise<ResultadoAltitude> {
    return this.provedor.consultarPonto(coordenada);
  }
}
