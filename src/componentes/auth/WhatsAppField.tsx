import { useMemo, type ClipboardEvent } from "react";
import type { CountryCode } from "libphonenumber-js";
import { AsYouType, getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js";

import { obterBandeiraUrl, obterNomePais, obterOpcoesPaises } from "../../utilitarios/localizacaoAuth";
import { normalizarWhatsApp } from "../../utilitarios/validacaoAuthBasica";
import { InfoTooltip } from "../ui/InfoTooltip";
import { SearchableSelect, type OpcaoSelecao } from "./SearchableSelect";

interface Props {
  valor: string;
  countryCode: string;
  erro?: string;
  aoAlterar: (valorE164: string, numeroFormatado: string) => void;
  aoAlterarPais: (countryCode: string, alteradoManualmente: boolean) => void;
}

function obterDdiSeguro(codigo: string): string | null {
  try {
    return getCountryCallingCode(codigo.toUpperCase() as CountryCode);
  } catch {
    return null;
  }
}

function obterOpcaoTelefone(codigo: string): OpcaoSelecao | null {
  const ddi = obterDdiSeguro(codigo);
  if (!ddi) {
    return null;
  }

  return {
    value: codigo.toUpperCase(),
    label: obterNomePais(codigo),
    descricao: `+${ddi}`,
    bandeiraUrl: obterBandeiraUrl(codigo),
    busca: `${obterNomePais(codigo)} ${codigo} ${ddi}`
  };
}

function formatarNacional(valor: string, countryCode: string): string {
  const numero = parsePhoneNumberFromString(valor);
  if (numero?.isValid()) {
    return numero.formatNational();
  }

  try {
    return new AsYouType(countryCode.toUpperCase() as CountryCode).input(valor.replace(/\D/g, ""));
  } catch {
    return valor.replace(/\D/g, "");
  }
}

export function WhatsAppField({ valor, countryCode, erro, aoAlterar, aoAlterarPais }: Props) {
  const paises = useMemo(
    () => obterOpcoesPaises().map((pais) => obterOpcaoTelefone(pais.value)).filter((pais): pais is OpcaoSelecao => Boolean(pais)),
    []
  );
  const codigo = obterDdiSeguro(countryCode || "BR") ? countryCode || "BR" : "BR";
  const ddi = obterDdiSeguro(codigo) ?? "55";
  const valorNacional = valor ? formatarNacional(valor, codigo) : "";
  const paisSelecionado = obterOpcaoTelefone(codigo);

  function alterarNumero(entrada: string) {
    const numeroCompleto = entrada.trim().startsWith("+");
    if (numeroCompleto) {
      const numero = parsePhoneNumberFromString(entrada);
      if (numero?.country) {
        aoAlterarPais(numero.country, true);
      }
      aoAlterar(numero?.isValid() ? numero.number : entrada, entrada);
      return;
    }

    const e164 = normalizarWhatsApp(entrada, codigo);
    aoAlterar(e164, entrada);
  }

  function colarNumero(evento: ClipboardEvent<HTMLInputElement>) {
    const texto = evento.clipboardData.getData("text");
    if (!texto.trim().startsWith("+")) {
      return;
    }
    evento.preventDefault();
    alterarNumero(texto);
  }

  return (
    <div className="auth-whatsapp">
      <SearchableSelect
        id="cadastro-whatsapp-pais"
        label="País do WhatsApp"
        value={paisSelecionado}
        options={paises}
        onChange={(opcao) => opcao && aoAlterarPais(opcao.value, true)}
        placeholder="País"
      />
      <label>
        <span className="rotulo-campo-formulario">
          <span>WhatsApp</span>
          {!erro && <InfoTooltip texto="O número será salvo com DDI no formato internacional." />}
        </span>
        <div className="auth-whatsapp-numero">
          <span>+{ddi}</span>
          <input
            type="tel"
            inputMode="tel"
            value={valorNacional}
            onChange={(evento) => alterarNumero(evento.target.value)}
            onPaste={colarNumero}
            placeholder={codigo === "BR" ? "(38) 99999-9999" : "Número local"}
            aria-invalid={Boolean(erro)}
            aria-describedby={erro ? "whatsapp-erro" : undefined}
          />
        </div>
        {erro && (
          <small id="whatsapp-erro" className="auth-erro-campo">
            {erro}
          </small>
        )}
      </label>
    </div>
  );
}
