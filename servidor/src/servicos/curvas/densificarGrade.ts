import { CURVAS_LIMITE_NOS_DENSIFICADOS } from "../../configuracao";
import { ErroAplicacao } from "../../utilitarios/erros";
import type { GradeCurvas, NoGradeCurvas } from "./tiposCurvas";

function interpolarNumero(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolarAltitude(a: number | null, b: number | null, c: number | null, d: number | null, tx: number, ty: number) {
  if (![a, b, c, d].every((valor) => Number.isFinite(valor))) {
    return null;
  }

  const superior = interpolarNumero(a as number, b as number, tx);
  const inferior = interpolarNumero(d as number, c as number, tx);
  const valor = interpolarNumero(superior, inferior, ty);
  const minimo = Math.min(a as number, b as number, c as number, d as number);
  const maximo = Math.max(a as number, b as number, c as number, d as number);
  return Math.min(Math.max(valor, minimo), maximo);
}

function calcularExtremos(nos: NoGradeCurvas[][]) {
  const altitudes = nos
    .flat()
    .map((no) => no.altitude)
    .filter((altitude): altitude is number => Number.isFinite(altitude));

  return {
    altitudeMinima: altitudes.length > 0 ? Math.min(...altitudes) : null,
    altitudeMaxima: altitudes.length > 0 ? Math.max(...altitudes) : null
  };
}

export function densificarGrade(grade: GradeCurvas, fatorEntrada = 4): GradeCurvas {
  const fator = Math.max(1, Math.round(fatorEntrada));
  if (fator === 1) {
    return grade;
  }

  const linhas = (grade.linhas - 1) * fator + 1;
  const colunas = (grade.colunas - 1) * fator + 1;
  if (linhas * colunas > CURVAS_LIMITE_NOS_DENSIFICADOS) {
    throw new ErroAplicacao("A área selecionada ficou grande demais para suavizar as curvas com segurança.");
  }

  const nos: NoGradeCurvas[][] = [];

  for (let linhaDensa = 0; linhaDensa < linhas; linhaDensa += 1) {
    const linhaBase = Math.min(Math.floor(linhaDensa / fator), grade.linhas - 2);
    const ty = linhaDensa === linhas - 1 ? 1 : (linhaDensa % fator) / fator;
    const linhaNos: NoGradeCurvas[] = [];

    for (let colunaDensa = 0; colunaDensa < colunas; colunaDensa += 1) {
      const colunaBase = Math.min(Math.floor(colunaDensa / fator), grade.colunas - 2);
      const tx = colunaDensa === colunas - 1 ? 1 : (colunaDensa % fator) / fator;
      const a = grade.nos[linhaBase][colunaBase];
      const b = grade.nos[linhaBase][colunaBase + 1];
      const c = grade.nos[linhaBase + 1][colunaBase + 1];
      const d = grade.nos[linhaBase + 1][colunaBase];

      linhaNos.push({
        latitude: interpolarNumero(a.latitude, d.latitude, ty),
        longitude: interpolarNumero(a.longitude, b.longitude, tx),
        altitude: interpolarAltitude(a.altitude, b.altitude, c.altitude, d.altitude, tx, ty)
      });
    }
    nos.push(linhaNos);
  }

  return {
    ...grade,
    linhas,
    colunas,
    resolucaoMetros: grade.resolucaoMetros / fator,
    nos,
    ...calcularExtremos(nos)
  };
}
