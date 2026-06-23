import {
  ChevronDown,
  Circle,
  FileDown,
  Info,
  Layers,
  LineChart,
  MapPin,
  Pentagon,
  Ruler,
  Square,
  UploadCloud
} from "lucide-react";
import { ReactNode, useEffect, useState } from "react";

import { analisarPropriedadeElemento } from "../servicos/apiPropriedades";
import type {
  AnalisePropriedade,
  CamadaImportada,
  CurvasNivelGeoJson,
  ElementoMapa,
  MetricaPropriedade
} from "../tipos/altimetria";
import { formatarMetros, formatarNumero } from "../utilitarios/formatacao";

interface PropriedadesSecao {
  titulo: string;
  icone: ReactNode;
  abertaInicialmente?: boolean;
  children: ReactNode;
}

function SecaoPainel({ titulo, icone, abertaInicialmente = false, children }: PropriedadesSecao) {
  const [aberta, setAberta] = useState(abertaInicialmente);
  return (
    <section className="secao-painel">
      <button className="cabecalho-secao" type="button" onClick={() => setAberta((valor) => !valor)}>
        <span>
          {icone}
          {titulo}
        </span>
        <ChevronDown className={aberta ? "seta aberta" : "seta"} size={16} aria-hidden="true" />
      </button>
      {aberta && <div className="conteudo-secao">{children}</div>}
    </section>
  );
}

interface PropriedadesPainelDireito {
  elementos: ElementoMapa[];
  elementoSelecionadoId: string | null;
  curvasNivel: CurvasNivelGeoJson | null;
  visibilidadeCamadaCurvasNivel: boolean;
  carregandoCurvas: boolean;
  selecionandoAreaCurvas: boolean;
  termoLocalizacao: string;
  carregandoLocalizacao: boolean;
  rotulosMapaAtivos: boolean;
  intervaloCurvasMetros: number;
  camadasImportadas: CamadaImportada[];
  areaSelecionadaParaCurvas: ElementoMapa | null;
  existeElementoSelecionado: boolean;
  aoAlterarTermoLocalizacao: (termo: string) => void;
  aoPesquisarLocalizacao: () => void;
  aoAlternarRotulosMapa: () => void;
  aoSelecionarElemento: (id: string) => void;
  aoAlterarIntervaloCurvas: (intervaloMetros: number) => void;
  aoGerarCurvas: () => void;
  aoGerarCurvasAreaSelecionada: () => void;
  aoLimparCurvas: () => void;
  aoImportarArquivo: () => void;
  aoAlternarCamadaImportada: (id: string) => void;
  aoAlternarCamadaCurvasNivel: () => void;
  aoExportarRelatorio: () => void;
  aoExportarCurvasKml: () => void;
  aoExportarCurvasKmz: () => void;
  aoExportarKml: () => void;
  aoCriarMarcadorTecnico: (metrica: MetricaPropriedade, elementoOrigem: ElementoMapa) => void;
}

function obterIconeElemento(tipo: string): ReactNode {
  const tipoNormalizado = tipo.toLowerCase();
  if (tipoNormalizado.includes("círculo")) {
    return <Circle size={15} aria-hidden="true" />;
  }
  if (tipoNormalizado.includes("retângulo")) {
    return <Square size={15} aria-hidden="true" />;
  }
  if (tipoNormalizado.includes("polígono")) {
    return <Pentagon size={15} aria-hidden="true" />;
  }
  if (tipoNormalizado.includes("linha")) {
    return <Ruler size={15} aria-hidden="true" />;
  }
  if (tipoNormalizado.includes("marcador")) {
    return <MapPin size={15} aria-hidden="true" />;
  }
  return <Layers size={15} aria-hidden="true" />;
}

function descreverGeometria(elemento: ElementoMapa | null): string {
  if (!elemento) {
    return "";
  }

  if (elemento.geometria.type === "Point") {
    return "Marcador pontual";
  }
  if (elemento.geometria.type === "LineString") {
    return `${elemento.geometria.coordinates.length} ponto(s) na linha`;
  }
  if (elemento.geometria.type === "Polygon") {
    return `${elemento.geometria.coordinates[0]?.length ?? 0} vértice(s) no polígono`;
  }
  return `Raio ${formatarMetros(elemento.geometria.radiusMeters, 0)}`;
}

function formatarCoordenadaCabecalho(coordenada: AnalisePropriedade["resumo"]["coordenadaCentral"]): string {
  if (!coordenada) {
    return "-";
  }
  return `${formatarNumero(coordenada.latitude, 6)}, ${formatarNumero(coordenada.longitude, 6)}`;
}

export function PainelDireito({
  elementos,
  elementoSelecionadoId,
  curvasNivel,
  visibilidadeCamadaCurvasNivel,
  carregandoCurvas,
  selecionandoAreaCurvas,
  termoLocalizacao,
  carregandoLocalizacao,
  rotulosMapaAtivos,
  intervaloCurvasMetros,
  camadasImportadas,
  areaSelecionadaParaCurvas,
  existeElementoSelecionado,
  aoAlterarTermoLocalizacao,
  aoPesquisarLocalizacao,
  aoAlternarRotulosMapa,
  aoSelecionarElemento,
  aoAlterarIntervaloCurvas,
  aoGerarCurvas,
  aoGerarCurvasAreaSelecionada,
  aoLimparCurvas,
  aoImportarArquivo,
  aoAlternarCamadaImportada,
  aoAlternarCamadaCurvasNivel,
  aoExportarRelatorio,
  aoExportarCurvasKml,
  aoExportarCurvasKmz,
  aoExportarKml,
  aoCriarMarcadorTecnico
}: PropriedadesPainelDireito) {
  const [menuExportacaoCurvasAberto, setMenuExportacaoCurvasAberto] = useState(false);
  const [analisePropriedade, setAnalisePropriedade] = useState<AnalisePropriedade | null>(null);
  const [carregandoPropriedade, setCarregandoPropriedade] = useState(false);
  const [erroPropriedade, setErroPropriedade] = useState<string | null>(null);
  const elementoSelecionado = elementos.find((elemento) => elemento.id === elementoSelecionadoId) ?? null;
  const selecaoInvalidaParaCurvas = existeElementoSelecionado && !areaSelecionadaParaCurvas;

  useEffect(() => {
    if (!elementoSelecionado) {
      setAnalisePropriedade(null);
      setErroPropriedade(null);
      setCarregandoPropriedade(false);
      return;
    }

    let ativa = true;
    setCarregandoPropriedade(true);
    setErroPropriedade(null);
    setAnalisePropriedade(null);

    analisarPropriedadeElemento(elementoSelecionado)
      .then((resultado) => {
        if (ativa) {
          setAnalisePropriedade(resultado);
        }
      })
      .catch((erro) => {
        if (ativa) {
          setErroPropriedade(erro instanceof Error ? erro.message : "Não foi possível calcular as propriedades.");
        }
      })
      .finally(() => {
        if (ativa) {
          setCarregandoPropriedade(false);
        }
      });

    return () => {
      ativa = false;
    };
  }, [elementoSelecionado]);

  return (
    <aside className="painel-direito">
      <SecaoPainel titulo="Localização" icone={<MapPin size={17} />}>
        <form
          className="campo-busca"
          onSubmit={(evento) => {
            evento.preventDefault();
            aoPesquisarLocalizacao();
          }}
        >
          <MapPin size={17} aria-hidden="true" />
          <input
            type="search"
            value={termoLocalizacao}
            onChange={(evento) => aoAlterarTermoLocalizacao(evento.target.value)}
            placeholder="Cidade, estado, país ou local"
            aria-label="Pesquisar localização"
          />
          <button type="submit" disabled={carregandoLocalizacao}>
            {carregandoLocalizacao ? "Buscando" : "Buscar"}
          </button>
        </form>

        <button className="botao-largo botao-secundario" type="button" onClick={aoAlternarRotulosMapa}>
          {rotulosMapaAtivos ? "Ocultar nomes e rótulos" : "Mostrar nomes e rótulos"}
        </button>
      </SecaoPainel>

      <SecaoPainel titulo="Camadas" icone={<Layers size={17} />}>
        <div className="lista-elementos-desenhados">
          <div className="item-camada-desenho item-camada-controle">
            <label className="controle-camada-curvas">
              <input
                type="checkbox"
                checked={visibilidadeCamadaCurvasNivel}
                onChange={aoAlternarCamadaCurvasNivel}
                disabled={!curvasNivel || curvasNivel.features.length === 0}
              />
              <span className="icone-camada-desenho">
                <LineChart size={15} aria-hidden="true" />
              </span>
              <span>
                <strong>Curvas de nível</strong>
                <small>
                  {curvasNivel
                    ? `${formatarNumero(curvasNivel.metadados.quantidadeCurvas ?? curvasNivel.features.length, 0)} curva(s) · ${
                        curvasNivel.metadados.fonte
                      } · ${formatarMetros(curvasNivel.metadados.resolucaoEfetivaMetros, 0)}`
                    : "Nenhuma curva gerada"}
                </small>
              </span>
            </label>
            <button
              className="botao-mini"
              type="button"
              onClick={aoLimparCurvas}
              disabled={!curvasNivel || curvasNivel.features.length === 0}
            >
              Limpar
            </button>
          </div>

          {elementos.length === 0 ? (
            <div className="estado-vazio">Nenhum elemento desenhado.</div>
          ) : (
            elementos.map((elemento) => (
              <button
                key={elemento.id}
                type="button"
                className={
                  elementoSelecionadoId === elemento.id ? "item-camada-desenho ativo" : "item-camada-desenho"
                }
                onClick={() => aoSelecionarElemento(elemento.id)}
              >
                <span className="icone-camada-desenho">{obterIconeElemento(elemento.tipo)}</span>
                <span>
                  <strong>{elemento.nome}</strong>
                  <small>{elemento.tipo}</small>
                </span>
                <span
                  className="cor-camada-desenho"
                  style={{ backgroundColor: elemento.cor }}
                  aria-hidden="true"
                />
              </button>
            ))
          )}
        </div>
      </SecaoPainel>

      <SecaoPainel titulo="Propriedade" icone={<Info size={17} />} abertaInicialmente>
        {elementoSelecionado ? (
          <>
            <div className="cabecalho-propriedade">
              <strong>{analisePropriedade?.resumo.nome ?? elementoSelecionado.nome}</strong>
              <div className="resumo-propriedade">
                <span>{analisePropriedade?.resumo.tipo ?? elementoSelecionado.tipo}</span>
                <span>{analisePropriedade?.resumo.quantidadePontos ?? descreverGeometria(elementoSelecionado)}</span>
                <span>{formatarCoordenadaCabecalho(analisePropriedade?.resumo.coordenadaCentral)}</span>
              </div>
            </div>

            {carregandoPropriedade && <div className="estado-vazio">Calculando propriedades...</div>}
            {erroPropriedade && <div className="estado-vazio erro-propriedade">{erroPropriedade}</div>}
            {analisePropriedade?.aviso && <div className="aviso-propriedade">{analisePropriedade.aviso}</div>}

            {analisePropriedade && (
              <div className="tabela-propriedades" role="table" aria-label="Tabela técnica da propriedade">
                <div className="linha-propriedade cabecalho" role="row">
                  <span role="columnheader">Item</span>
                  <span role="columnheader">Valor</span>
                  <span role="columnheader">Ação</span>
                </div>
                {analisePropriedade.metricas.map((metrica) => (
                  <button
                    key={metrica.chave}
                    className={
                      metrica.clicavel && metrica.coordenada
                        ? "linha-propriedade linha-propriedade-clicavel"
                        : "linha-propriedade"
                    }
                    type="button"
                    disabled={!metrica.clicavel || !metrica.coordenada}
                    onClick={() => aoCriarMarcadorTecnico(metrica, elementoSelecionado)}
                    role="row"
                  >
                    <span role="cell">{metrica.item}</span>
                    <strong className="valor-propriedade" role="cell">{metrica.valor}</strong>
                    <span role="cell">{metrica.clicavel && metrica.coordenada ? "Marcar" : "-"}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : null}
      </SecaoPainel>

      <SecaoPainel titulo="Importação" icone={<UploadCloud size={17} />}>
        <button className="botao-largo" type="button" onClick={aoImportarArquivo}>
          Importar KML, KMZ ou GeoJSON
        </button>
        {camadasImportadas.length === 0 ? (
          <div className="estado-vazio">Nenhuma camada importada.</div>
        ) : (
          <div className="lista-camadas-importadas">
            {camadasImportadas.map((camada) => (
              <label key={camada.id}>
                <input
                  type="checkbox"
                  checked={camada.ativa}
                  onChange={() => aoAlternarCamadaImportada(camada.id)}
                />
                <span>
                  {camada.nome}
                  <small>{camada.quantidadeElementos} elementos</small>
                </span>
              </label>
            ))}
          </div>
        )}
      </SecaoPainel>

      <SecaoPainel titulo="Curvas de nível" icone={<LineChart size={17} />}>
        <div className="grupo-controles">
          <span className="rotulo-bloco">Intervalo</span>
          <select
            className="seletor-elemento"
            value={intervaloCurvasMetros}
            onChange={(evento) => aoAlterarIntervaloCurvas(Number(evento.target.value))}
          >
            {[1, 2, 5, 10, 20, 40, 80, 100].map((intervalo) => (
              <option key={intervalo} value={intervalo}>
                {intervalo} m
              </option>
            ))}
          </select>
        </div>

        <div className="acoes-linha">
          <button
            type="button"
            onClick={aoGerarCurvasAreaSelecionada}
            disabled={!areaSelecionadaParaCurvas || carregandoCurvas}
          >
            {areaSelecionadaParaCurvas ? "Gerar da área selecionada" : "Selecionar área no mapa"}
          </button>
          <button type="button" onClick={aoGerarCurvas} disabled={carregandoCurvas || selecionandoAreaCurvas}>
            {carregandoCurvas ? "Gerando" : selecionandoAreaCurvas ? "Desenhe o retângulo" : "Gerar por retângulo"}
          </button>
          <button type="button" className="botao-secundario" onClick={aoLimparCurvas}>
            Limpar
          </button>
        </div>

        {areaSelecionadaParaCurvas && (
          <div className="area-curvas-selecionada">Área selecionada: {areaSelecionadaParaCurvas.nome}</div>
        )}

        {selecaoInvalidaParaCurvas && (
          <div className="aviso-curvas">
            Selecione um retângulo, círculo ou polígono para gerar curvas pela área selecionada.
          </div>
        )}

        <div className="menu-exportacao-curvas">
          <button
            className="botao-largo"
            type="button"
            onClick={() => setMenuExportacaoCurvasAberto((valor) => !valor)}
            disabled={!curvasNivel || curvasNivel.features.length === 0}
            title={!curvasNivel || curvasNivel.features.length === 0 ? "Gere curvas de nível antes de exportar." : undefined}
          >
            Exportar curvas
          </button>

          {menuExportacaoCurvasAberto && curvasNivel && curvasNivel.features.length > 0 && (
            <div className="opcoes-exportacao-curvas">
              <button
                type="button"
                onClick={() => {
                  setMenuExportacaoCurvasAberto(false);
                  aoExportarCurvasKml();
                }}
              >
                KML
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuExportacaoCurvasAberto(false);
                  aoExportarCurvasKmz();
                }}
              >
                KMZ
              </button>
            </div>
          )}
        </div>
      </SecaoPainel>

      <SecaoPainel titulo="Exportação" icone={<FileDown size={17} />} abertaInicialmente={false}>
        <div className="grade-exportacao">
          <button type="button" onClick={aoExportarRelatorio}>PDF</button>
          <button type="button" onClick={aoExportarKml}>KML</button>
          <button type="button" onClick={() => window.print()}>Imagem do mapa</button>
          <button type="button" onClick={aoExportarRelatorio}>Gráfico</button>
        </div>
      </SecaoPainel>
    </aside>
  );
}
