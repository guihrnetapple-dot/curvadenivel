import { useMemo, useState } from "react";

import type { DadosPerfilCadastro } from "../../tipos/autenticacao";
import type { ErrosCamposAuth } from "../../utilitarios/validacaoAuth";
import {
  obterOpcaoPais,
  obterOpcoesCidades,
  obterOpcoesEstados,
  obterOpcoesPaises,
  criarAtualizacaoEstadoEndereco,
  criarAtualizacaoPaisEndereco
} from "../../utilitarios/localizacaoAuth";
import { SearchableSelect, type OpcaoSelecao } from "./SearchableSelect";

interface Props {
  valores: DadosPerfilCadastro;
  erros?: ErrosCamposAuth;
  aoAlterar: (campo: keyof DadosPerfilCadastro, valor: string | boolean) => void;
  aoPaisEnderecoAlterado?: (countryCode: string) => void;
}

export function LocationFields({ valores, erros, aoAlterar, aoPaisEnderecoAlterado }: Props) {
  const [cidadeManual, setCidadeManual] = useState(false);
  const [estadoManual, setEstadoManual] = useState(false);
  const paises = useMemo(() => obterOpcoesPaises(), []);
  const estados = useMemo(() => obterOpcoesEstados(valores.countryCode), [valores.countryCode]);
  const cidades = useMemo(() => obterOpcoesCidades(valores.countryCode, valores.stateCode), [valores.countryCode, valores.stateCode]);
  const paisSelecionado = valores.countryCode ? obterOpcaoPais(valores.countryCode) : null;
  const estadoSelecionado = estados.find((estado) => estado.value === valores.stateCode) ?? null;
  const cidadeSelecionada = cidades.find((cidade) => cidade.value === valores.city) ?? null;
  const exigeEstado = estados.length > 0;
  const podeSelecionarCidade = Boolean(valores.countryCode && (!exigeEstado || valores.stateCode));

  function alterarPais(opcao: OpcaoSelecao | null) {
    const codigo = opcao?.value ?? "";
    if (codigo) {
      const atualizacao = criarAtualizacaoPaisEndereco(codigo);
      aoAlterar("countryCode", atualizacao.countryCode);
      aoAlterar("country", atualizacao.country);
      aoAlterar("stateCode", atualizacao.stateCode);
      aoAlterar("state", atualizacao.state);
      aoAlterar("city", atualizacao.city);
    } else {
      aoAlterar("countryCode", "");
      aoAlterar("country", "");
      aoAlterar("stateCode", "");
      aoAlterar("state", "");
      aoAlterar("city", "");
    }
    setCidadeManual(false);
    setEstadoManual(false);
    aoAlterar("cidadeManual", false);
    aoAlterar("estadoManual", false);
    if (codigo) {
      aoPaisEnderecoAlterado?.(codigo);
    }
  }

  function alterarEstado(opcao: OpcaoSelecao | null) {
    const atualizacao = criarAtualizacaoEstadoEndereco(opcao?.value ?? "", opcao?.label ?? "");
    aoAlterar("stateCode", atualizacao.stateCode);
    aoAlterar("state", atualizacao.state);
    aoAlterar("city", atualizacao.city);
    setCidadeManual(false);
    aoAlterar("cidadeManual", false);
  }

  function ativarLocalidadeManual() {
    if (exigeEstado && !valores.stateCode) {
      setEstadoManual(true);
      aoAlterar("estadoManual", true);
      aoAlterar("stateCode", "");
      aoAlterar("state", "");
    }

    setCidadeManual(true);
    aoAlterar("cidadeManual", true);
    aoAlterar("city", "");
  }

  return (
    <div className="auth-grade-campos auth-grade-localizacao">
      <SearchableSelect
        id="cadastro-pais"
        label="País"
        value={paisSelecionado}
        options={paises}
        onChange={alterarPais}
        placeholder="Pesquisar país"
        erro={erros?.country}
      />

      {estadoManual ? (
        <label>
          Estado/Província
          <input
            value={valores.state}
            onChange={(evento) => aoAlterar("state", evento.target.value)}
            aria-invalid={Boolean(erros?.state)}
            aria-describedby={erros?.state ? "estado-erro" : undefined}
          />
          {erros?.state && <small id="estado-erro" className="auth-erro-campo">{erros.state}</small>}
        </label>
      ) : (
        <SearchableSelect
          id="cadastro-estado"
          label="Estado/Província"
          value={estadoSelecionado}
          options={estados}
          onChange={alterarEstado}
          placeholder={valores.countryCode ? "Pesquisar estado" : "Selecione o país primeiro"}
          disabled={!valores.countryCode || !exigeEstado}
          helperText={!exigeEstado && valores.countryCode ? "Este país não possui estados cadastrados na base." : undefined}
          erro={erros?.state}
        />
      )}

      {cidadeManual ? (
        <label>
          Cidade
          <input
            value={valores.city}
            onChange={(evento) => aoAlterar("city", evento.target.value)}
            aria-invalid={Boolean(erros?.city)}
            aria-describedby={erros?.city ? "cidade-erro" : undefined}
          />
          {erros?.city && <small id="cidade-erro" className="auth-erro-campo">{erros.city}</small>}
        </label>
      ) : (
        <SearchableSelect
          id="cadastro-cidade"
          label="Cidade"
          value={cidadeSelecionada}
          options={cidades}
          onChange={(opcao) => aoAlterar("city", opcao?.value ?? "")}
          placeholder={podeSelecionarCidade ? "Pesquisar cidade" : "Selecione a localização primeiro"}
          disabled={!podeSelecionarCidade}
          erro={erros?.city}
        />
      )}

      <div className="auth-localidade-manual">
        {valores.countryCode && (
          <button
            type="button"
            className="auth-link-discreto"
            onClick={ativarLocalidadeManual}
          >
            Minha localidade não aparece
          </button>
        )}
      </div>
    </div>
  );
}
