import {
  ChevronDown,
  Circle,
  Crosshair,
  FileDown,
  Layers,
  LineChart,
  MapPin,
  Pentagon,
  Ruler,
  Square,
  UploadCloud
} from "lucide-react";
import { ReactNode, useState } from "react";

import type {
  CamadaImportada,
  CurvasNivelGeoJson,
  ElementoMapa,
  PerfilElevacao,
  ResultadoAltitude
} from "../tipos/altimetria";
import { formatarArea, formatarMetros, formatarNumero } from "../utilitarios/formatacao";

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
  resultadoAtual: ResultadoAltitude | null;
  elementos: ElementoMapa[];
  elementoSelecionadoId: string | null;
  perfil: PerfilElevacao | null;
  carregandoPerfil: boolean;
  curvasNivel: CurvasNivelGeoJson | null;
  carregandoCurvas: boolean;
  selecionandoAreaCurvas: boolean;
  selecionandoPontoAltitude: boolean;
  termoLocalizacao: string;
  carregandoLocalizacao: boolean;
  rotulosMapaAtivos: boolean;
  intervaloCurvasMetros: number;
  resolucaoCurvasMetros: number;
  camadasImportadas: CamadaImportada[];
  aoAnalisarPonto: () => void;
  aoAlterarTermoLocalizacao: (termo: string) => void;
  aoPesquisarLocalizacao: () => void;
  aoAlternarRotulosMapa: () => void;
  aoSelecionarElemento: (id: string) => void;
  aoAnalisarPerfil: () => void;
  aoLimparAnalise: () => void;
  aoAlterarIntervaloCurvas: (intervaloMetros: number) => void;
  aoAlterarResolucaoCurvas: (resolucaoMetros: number) => void;
  aoGerarCurvas: () => void;
  aoLimparCurvas: () => void;
  aoImportarArquivo: () => void;
  aoAlternarCamadaImportada: (id: string) => void;
  aoExportarRelatorio: () => void;
  aoExportarCsv: () => void;
  aoExportarGeoJson: () => void;
  aoExportarCurvasGeoJson: () => void;
  aoExportarKml: () => void;
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

export function PainelDireito({
  resultadoAtual,
  elementos,
  elementoSelecionadoId,
  perfil,
  carregandoPerfil,
  curvasNivel,
  carregandoCurvas,
  selecionandoAreaCurvas,
  selecionandoPontoAltitude,
  termoLocalizacao,
  carregandoLocalizacao,
  rotulosMapaAtivos,
  intervaloCurvasMetros,
  resolucaoCurvasMetros,
  camadasImportadas,
  aoAnalisarPonto,
  aoAlterarTermoLocalizacao,
  aoPesquisarLocalizacao,
  aoAlternarRotulosMapa,
  aoSelecionarElemento,
  aoAnalisarPerfil,
  aoLimparAnalise,
  aoAlterarIntervaloCurvas,
  aoAlterarResolucaoCurvas,
  aoGerarCurvas,
  aoLimparCurvas,
  aoImportarArquivo,
  aoAlternarCamadaImportada,
  aoExportarRelatorio,
  aoExportarCsv,
  aoExportarGeoJson,
  aoExportarCurvasGeoJson,
  aoExportarKml
}: PropriedadesPainelDireito) {
  const elementoSelecionado = elementos.find((elemento) => elemento.id === elementoSelecionadoId) ?? null;

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

      <SecaoPainel titulo="Consulta de altitude" icone={<Crosshair size={17} />}>
        <button className="botao-largo" type="button" onClick={aoAnalisarPonto} disabled={selecionandoPontoAltitude}>
          {selecionandoPontoAltitude ? "Clique no mapa" : "Analisar ponto"}
        </button>

        <div className="resultado-atual">
          <span>Última altitude</span>
          <strong>{resultadoAtual ? formatarMetros(resultadoAtual.altitude, 2) : "-"}</strong>
          {resultadoAtual && (
            <small>
              Método: API · Fonte: Open-Elevation
            </small>
          )}
          <small>
            {resultadoAtual?.avisoPrecisao ??
              "Estimativa suavizada; a precisão real depende da resolução da fonte DEM."}
          </small>
          <small>{resultadoAtual?.mensagem ?? "Aguardando consulta."}</small>
        </div>
      </SecaoPainel>

      <SecaoPainel titulo="Perfil de elevação" icone={<LineChart size={17} />}>
        {elementos.length === 0 ? (
          <div className="estado-vazio">Nenhum desenho disponível.</div>
        ) : (
          <select
            className="seletor-elemento"
            value={elementoSelecionadoId ?? ""}
            onChange={(evento) => aoSelecionarElemento(evento.target.value)}
          >
            <option value="">Selecionar elemento</option>
            {elementos.map((elemento) => (
              <option key={elemento.id} value={elemento.id}>
                {elemento.nome}
              </option>
            ))}
          </select>
        )}

        <div className="acoes-linha">
          <button type="button" onClick={aoAnalisarPerfil} disabled={!elementoSelecionado || carregandoPerfil}>
            {carregandoPerfil ? "Analisando" : "Analisar perfil"}
          </button>
          <button type="button" className="botao-secundario" onClick={aoLimparAnalise}>
            Limpar
          </button>
        </div>

        <div className="grade-metricas">
          <div>
            <span>Mínima</span>
            <strong>{formatarMetros(perfil?.estatisticas.altitudeMinima, 2)}</strong>
          </div>
          <div>
            <span>Máxima</span>
            <strong>{formatarMetros(perfil?.estatisticas.altitudeMaxima, 2)}</strong>
          </div>
          <div>
            <span>Média</span>
            <strong>{formatarMetros(perfil?.estatisticas.altitudeMedia, 2)}</strong>
          </div>
          <div>
            <span>Desnível</span>
            <strong>{formatarMetros(perfil?.estatisticas.diferencaNivel, 2)}</strong>
          </div>
          <div>
            <span>Inclinação</span>
            <strong>{formatarNumero(perfil?.estatisticas.inclinacaoMediaPercentual, 2)}%</strong>
          </div>
          <div>
            <span>Comprimento</span>
            <strong>{formatarMetros(perfil?.estatisticas.comprimentoTotalMetros, 0)}</strong>
          </div>
          <div>
            <span>Área</span>
            <strong>{formatarArea(perfil?.estatisticas.areaMetrosQuadrados)}</strong>
          </div>
          <div>
            <span>Sem dado</span>
            <strong>{formatarNumero(perfil?.estatisticas.pontosSemDado, 0)}</strong>
          </div>
        </div>
        {perfil?.estatisticas.avisoAmostragem && (
          <div className="estado-vazio">{perfil.estatisticas.avisoAmostragem}</div>
        )}
      </SecaoPainel>

      <SecaoPainel titulo="Curvas de nível" icone={<LineChart size={17} />}>
        <div className="aviso-curvas">
          Curvas geradas a partir de amostras consultadas na Open-Elevation e suavizadas matematicamente. A suavização melhora a representação visual, mas não aumenta a precisão da fonte.
        </div>

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

        <div className="grupo-controles">
          <span className="rotulo-bloco">Resolução</span>
          <div className="controle-segmentado">
            {[50, 100, 250, 500].map((resolucao) => (
              <button
                key={resolucao}
                type="button"
                className={resolucaoCurvasMetros === resolucao ? "ativo" : ""}
                onClick={() => aoAlterarResolucaoCurvas(resolucao)}
              >
                {resolucao} m
              </button>
            ))}
          </div>
        </div>

        <div className="acoes-linha">
          <button type="button" onClick={aoGerarCurvas} disabled={carregandoCurvas || selecionandoAreaCurvas}>
            {carregandoCurvas ? "Gerando" : selecionandoAreaCurvas ? "Desenhe o retângulo" : "Gerar por retângulo"}
          </button>
          <button type="button" className="botao-secundario" onClick={aoLimparCurvas}>
            Limpar
          </button>
        </div>

        <button
          className="botao-largo"
          type="button"
          onClick={aoExportarCurvasGeoJson}
          disabled={!curvasNivel || curvasNivel.features.length === 0}
        >
          Exportar GeoJSON
        </button>

        <div className="grade-metricas">
          <div>
            <span>Curvas</span>
            <strong>{formatarNumero(curvasNivel?.metadados.quantidadeCurvas ?? curvasNivel?.features.length, 0)}</strong>
          </div>
          <div>
            <span>Mínima</span>
            <strong>{formatarMetros(curvasNivel?.metadados.altitudeMinima, 0)}</strong>
          </div>
          <div>
            <span>Máxima</span>
            <strong>{formatarMetros(curvasNivel?.metadados.altitudeMaxima, 0)}</strong>
          </div>
          <div>
            <span>Resolução efetiva</span>
            <strong>{formatarMetros(curvasNivel?.metadados.resolucaoEfetivaMetros, 0)}</strong>
          </div>
          <div>
            <span>Pontos</span>
            <strong>{formatarNumero(curvasNivel?.metadados.pontosConsultados, 0)}</strong>
          </div>
          <div>
            <span>Cache</span>
            <strong>{curvasNivel?.metadados.cacheAtivo ? "Ativo" : "-"}</strong>
          </div>
        </div>

        {curvasNivel?.metadados.resolucaoAjustada && (
          <div className="estado-vazio">
            Resolução ajustada automaticamente de {formatarMetros(curvasNivel.metadados.resolucaoSolicitadaMetros, 0)} para{" "}
            {formatarMetros(curvasNivel.metadados.resolucaoEfetivaMetros, 0)}.
          </div>
        )}

        {curvasNivel?.metadados.avisoPrecisao && (
          <div className="estado-vazio">{curvasNivel.metadados.avisoPrecisao}</div>
        )}
      </SecaoPainel>

      <SecaoPainel titulo="Exportação" icone={<FileDown size={17} />} abertaInicialmente={false}>
        <div className="grade-exportacao">
          <button type="button" onClick={aoExportarRelatorio}>PDF</button>
          <button type="button" onClick={aoExportarCsv}>CSV</button>
          <button type="button" onClick={aoExportarGeoJson}>GeoJSON</button>
          <button type="button" onClick={aoExportarKml}>KML</button>
          <button type="button" onClick={() => window.print()}>Imagem do mapa</button>
          <button type="button" onClick={aoExportarCsv}>Gráfico</button>
        </div>
      </SecaoPainel>
    </aside>
  );
}
