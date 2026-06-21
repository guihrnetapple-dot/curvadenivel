import {
  ChevronDown,
  Circle,
  Crosshair,
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
  visibilidadeCamadaCurvasNivel: boolean;
  carregandoCurvas: boolean;
  selecionandoAreaCurvas: boolean;
  selecionandoPontoAltitude: boolean;
  termoLocalizacao: string;
  carregandoLocalizacao: boolean;
  rotulosMapaAtivos: boolean;
  intervaloCurvasMetros: number;
  camadasImportadas: CamadaImportada[];
  aoAnalisarPonto: () => void;
  aoAlterarTermoLocalizacao: (termo: string) => void;
  aoPesquisarLocalizacao: () => void;
  aoAlternarRotulosMapa: () => void;
  aoSelecionarElemento: (id: string) => void;
  aoAnalisarPerfil: () => void;
  aoLimparAnalise: () => void;
  aoAlterarIntervaloCurvas: (intervaloMetros: number) => void;
  aoGerarCurvas: () => void;
  aoLimparCurvas: () => void;
  aoImportarArquivo: () => void;
  aoAlternarCamadaImportada: (id: string) => void;
  aoAlternarCamadaCurvasNivel: () => void;
  aoExportarRelatorio: () => void;
  aoExportarCsv: () => void;
  aoExportarGeoJson: () => void;
  aoExportarElementoGeoJson: () => void;
  aoExportarElementoKml: () => void;
  aoExportarCurvasKml: () => void;
  aoExportarCurvasKmz: () => void;
  aoExportarCurvasDxf: () => void;
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

function elementoPossuiArea(elemento: ElementoMapa | null): boolean {
  return elemento?.geometria.type === "Polygon" || elemento?.geometria.type === "Circle";
}

function elementoPossuiPerfilLinear(elemento: ElementoMapa | null): boolean {
  return elemento?.geometria.type === "LineString";
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

export function PainelDireito({
  resultadoAtual,
  elementos,
  elementoSelecionadoId,
  perfil,
  carregandoPerfil,
  curvasNivel,
  visibilidadeCamadaCurvasNivel,
  carregandoCurvas,
  selecionandoAreaCurvas,
  selecionandoPontoAltitude,
  termoLocalizacao,
  carregandoLocalizacao,
  rotulosMapaAtivos,
  intervaloCurvasMetros,
  camadasImportadas,
  aoAnalisarPonto,
  aoAlterarTermoLocalizacao,
  aoPesquisarLocalizacao,
  aoAlternarRotulosMapa,
  aoSelecionarElemento,
  aoAnalisarPerfil,
  aoLimparAnalise,
  aoAlterarIntervaloCurvas,
  aoGerarCurvas,
  aoLimparCurvas,
  aoImportarArquivo,
  aoAlternarCamadaImportada,
  aoAlternarCamadaCurvasNivel,
  aoExportarRelatorio,
  aoExportarCsv,
  aoExportarGeoJson,
  aoExportarElementoGeoJson,
  aoExportarElementoKml,
  aoExportarCurvasKml,
  aoExportarCurvasKmz,
  aoExportarCurvasDxf,
  aoExportarKml
}: PropriedadesPainelDireito) {
  const [menuExportacaoCurvasAberto, setMenuExportacaoCurvasAberto] = useState(false);
  const elementoSelecionado = elementos.find((elemento) => elemento.id === elementoSelecionadoId) ?? null;
  const podeAnalisarPerfilLinear = elementoPossuiPerfilLinear(elementoSelecionado);
  const podeAnalisarArea = elementoPossuiArea(elementoSelecionado);

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
            <div className="resultado-atual propriedade-selecionada">
              <span>Elemento selecionado</span>
              <strong>{elementoSelecionado.nome}</strong>
              <small>
                {elementoSelecionado.tipo} · {descreverGeometria(elementoSelecionado)}
              </small>
            </div>

            <div className="acoes-linha">
              <button
                type="button"
                onClick={aoAnalisarPerfil}
                disabled={!podeAnalisarPerfilLinear || carregandoPerfil}
                title={!podeAnalisarPerfilLinear ? "Use uma linha para analisar perfil linear." : undefined}
              >
                {carregandoPerfil ? "Analisando" : "Analisar perfil"}
              </button>
              <button
                type="button"
                onClick={aoAnalisarPerfil}
                disabled={!podeAnalisarArea || carregandoPerfil}
                title={!podeAnalisarArea ? "Use polígono, retângulo ou círculo para analisar área." : undefined}
              >
                {carregandoPerfil ? "Analisando" : "Analisar área"}
              </button>
            </div>

            <div className="grade-exportacao">
              <button type="button" onClick={aoExportarElementoGeoJson}>
                GeoJSON
              </button>
              <button type="button" onClick={aoExportarElementoKml}>
                KML
              </button>
            </div>
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

      <SecaoPainel titulo="Consulta de altitude" icone={<Crosshair size={17} />}>
        <button className="botao-largo" type="button" onClick={aoAnalisarPonto} disabled={selecionandoPontoAltitude}>
          {selecionandoPontoAltitude ? "Clique no mapa" : "Analisar ponto"}
        </button>

        <div className="resultado-atual">
          <span>Última altitude</span>
          <strong>{resultadoAtual ? formatarMetros(resultadoAtual.altitude, 2) : "-"}</strong>
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

        <div className="estado-vazio">Resolução fixa da grade: 50 m</div>

        <div className="acoes-linha">
          <button type="button" onClick={aoGerarCurvas} disabled={carregandoCurvas || selecionandoAreaCurvas}>
            {carregandoCurvas ? "Gerando" : selecionandoAreaCurvas ? "Desenhe o retângulo" : "Gerar por retângulo"}
          </button>
          <button type="button" className="botao-secundario" onClick={aoLimparCurvas}>
            Limpar
          </button>
        </div>

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
              <button
                type="button"
                onClick={() => {
                  setMenuExportacaoCurvasAberto(false);
                  aoExportarCurvasDxf();
                }}
              >
                DXF
              </button>
            </div>
          )}
        </div>

        <div className="grade-metricas">
          <div>
            <span>Curvas</span>
            <strong>{formatarNumero(curvasNivel?.metadados.quantidadeCurvas ?? curvasNivel?.features.length, 0)}</strong>
          </div>
          <div>
            <span>Intervalo</span>
            <strong>{formatarMetros(curvasNivel?.metadados.intervaloMetros, 0)}</strong>
          </div>
          <div>
            <span>Grade</span>
            <strong>{formatarMetros(curvasNivel?.metadados.resolucaoGradeGlobalMetros, 0)}</strong>
          </div>
          <div>
            <span>Fonte</span>
            <strong>{curvasNivel?.metadados.fonte ? "Open-Elevation" : "-"}</strong>
          </div>
        </div>

        {curvasNivel && (
          <div className="estado-vazio">
            Usado: intervalo {formatarMetros(curvasNivel.metadados.intervaloMetros, 0)}, resolução{" "}
            {formatarMetros(curvasNivel.metadados.resolucaoGradeGlobalMetros, 0)}
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
