import { City, Country, State } from "country-state-city";

import type { OpcaoSelecao } from "../componentes/auth/SearchableSelect";

function criarLocalizadorPaises(): Intl.DisplayNames | null {
  try {
    if (typeof Intl.DisplayNames !== "function") {
      return null;
    }
    return new Intl.DisplayNames(["pt-BR"], { type: "region" });
  } catch {
    return null;
  }
}

const nomesPaises = criarLocalizadorPaises();

export function normalizarCodigoPais(codigo?: string | null): string {
  const normalizado = String(codigo ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalizado) && Country.getCountryByCode(normalizado) ? normalizado : "BR";
}

function normalizarTextoLocalizacao(valor?: string | null): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function obterNomePais(codigo: string): string {
  const codigoNormalizado = codigo.toUpperCase();
  return nomesPaises?.of(codigoNormalizado) ?? Country.getCountryByCode(codigoNormalizado)?.name ?? codigoNormalizado;
}

export function obterCodigoPaisPorNome(nomeOuCodigo?: string | null): string {
  const valor = String(nomeOuCodigo ?? "").trim();
  if (!valor) {
    return "BR";
  }

  const codigoDireto = valor.toUpperCase();
  if (/^[A-Z]{2}$/.test(codigoDireto) && Country.getCountryByCode(codigoDireto)) {
    return codigoDireto;
  }

  const valorNormalizado = normalizarTextoLocalizacao(valor);
  const pais = Country.getAllCountries().find((item) => {
    return [item.isoCode, item.name, obterNomePais(item.isoCode)]
      .some((opcao) => normalizarTextoLocalizacao(opcao) === valorNormalizado);
  });

  return pais?.isoCode ?? "BR";
}

export function obterCodigoEstadoPorNome(codigoPais?: string | null, nomeOuCodigo?: string | null): string {
  const valor = String(nomeOuCodigo ?? "").trim();
  if (!valor) {
    return "";
  }

  const countryCode = normalizarCodigoPais(codigoPais);
  const valorNormalizado = normalizarTextoLocalizacao(valor);
  const estado = State.getStatesOfCountry(countryCode).find((item) => {
    return [item.isoCode, item.name].some((opcao) => normalizarTextoLocalizacao(opcao) === valorNormalizado);
  });

  return estado?.isoCode ?? "";
}

export function obterBandeiraUrl(codigo: string): string {
  return `https://flagcdn.com/w40/${codigo.toLowerCase()}.png`;
}

export function obterOpcoesPaises(): OpcaoSelecao[] {
  return Country.getAllCountries()
    .map((pais) => ({
      value: pais.isoCode,
      label: obterNomePais(pais.isoCode),
      descricao: `${pais.name} · ${pais.isoCode}`,
      bandeiraUrl: obterBandeiraUrl(pais.isoCode),
      busca: `${pais.name} ${pais.isoCode} ${pais.phonecode}`
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function obterOpcaoPais(codigo?: string | null): OpcaoSelecao | null {
  const pais = Country.getCountryByCode(normalizarCodigoPais(codigo));
  if (!pais) return null;
  return {
    value: pais.isoCode,
    label: obterNomePais(pais.isoCode),
    descricao: `${pais.name} · ${pais.isoCode}`,
    bandeiraUrl: obterBandeiraUrl(pais.isoCode),
    busca: `${pais.name} ${pais.isoCode} ${pais.phonecode}`
  };
}

export function obterOpcoesEstados(codigoPais?: string): OpcaoSelecao[] {
  if (!codigoPais) return [];
  return State.getStatesOfCountry(codigoPais).map((estado) => ({
    value: estado.isoCode,
    label: estado.name,
    descricao: estado.isoCode,
    busca: `${estado.name} ${estado.isoCode}`
  }));
}

export function obterOpcoesCidades(codigoPais?: string, codigoEstado?: string): OpcaoSelecao[] {
  if (!codigoPais) return [];
  const cidades = codigoEstado ? City.getCitiesOfState(codigoPais, codigoEstado) : City.getCitiesOfCountry(codigoPais) ?? [];
  return cidades
    .map((cidade) => ({ value: cidade.name, label: cidade.name, busca: cidade.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function obterRegiaoNavegador(): string {
  try {
    const Locale = Intl.Locale;
    if (typeof Locale !== "function") {
      return "BR";
    }
    return normalizarCodigoPais(new Locale(navigator.language).maximize().region);
  } catch {
    return "BR";
  }
}

export function criarAtualizacaoPaisEndereco(codigoPais: string) {
  const countryCode = normalizarCodigoPais(codigoPais);
  return {
    countryCode,
    country: obterNomePais(countryCode),
    stateCode: "",
    state: "",
    city: ""
  };
}

export function criarAtualizacaoEstadoEndereco(codigoEstado: string, nomeEstado: string) {
  return {
    stateCode: codigoEstado,
    state: nomeEstado,
    city: ""
  };
}
