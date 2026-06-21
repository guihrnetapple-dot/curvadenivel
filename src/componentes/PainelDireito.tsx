import {
  ChevronDown,
  Circle,
  Crosshair,
  Eraser,
  FileDown,
  Layers,
  LineChart,
  MapPin,
  MousePointer2,
  Move,
  Pencil,
  Pentagon,
  Ruler,
  Square,
  UploadCloud
} from "lucide-react";
import { FormEvent, ReactNode, useState } from "react";

import type {
  CamadaBase,
  CamadaImportada,
  CamadasVisiveis,
  ElementoMapa,
  PerfilElevacao,
  ResultadoAltitude
} from "../tipos/altimetria";
import { formatarArea, formatarMetros, formatarNumero } from "../utilitarios/formatacao";
import { TabelaHistorico } from "./TabelaHistorico";

interface PropriedadesSecao {
  titulo: string;
  icone: ReactNode;
  abertaInicialmente?: boolean;
  children: ReactNode;
}

function SecaoPainel({ titulo, icone, abertaInicialmente = true, children }: PropriedadesSecao) {
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
  camadaBase: CamadaBase;
  camadasVisiveis: CamadasVisiveis;
  resultadoAtual: ResultadoAltitude | null;
  historico: ResultadoAltitude[];
  elementos: ElementoMapa[];
  elementoSelecionadoId: string | null;
  perfil: PerfilElevacao | null;
  carregandoPerfil: boolean;
  camadasImportadas: CamadaImportada[];
  aoAlterarCamadaBase: (camada: CamadaBase) => void;
  aoAlternarCamada: (camada: keyof CamadasVisiveis) => void;
  aoConsultarManual: (latitude: number, longitude: number) => void;
  aoSelecionarElemento: (id: string) => void;
  aoAnalisarPerfil: () => void;
  aoLimparAnalise: () => void;
  aoImportarArquivo: () => void;
  aoAlternarCamadaImportada: (id: string) => void;
  aoExportarRelatorio: () => void;
  aoExportarCsv: () => void;
  aoExportarGeoJson: () => void;
  aoExportarKml: () => void;
}

const ferramentasDesenho = [
  { nome: "Marcador", icone: <MapPin size={15} /> },
  { nome: "Linha", icone: <Ruler size={15} /> },
  { nome: "Polilinha", icone: <Pencil size={15} /> },
  { nome: "Caminho", icone: <MousePointer2 size={15} /> },
  { nome: "Retângulo", icone: <Square size={15} /> },
  { nome: "Círculo", icone: <Circle size={15} /> },
  { nome: "Polígono", icone: <Pentagon size={15} /> },
  { nome: "Apagar", icone: <Eraser size={15} /> },
  { nome: "Editar vértices", icone: <Pencil size={15} /> },
  { nome: "Mover", icone: <Move size={15} /> }
];

export function PainelDireito({
  camadaBase,
  camadasVisiveis,
  resultadoAtual,
  historico,
  elementos,
  elementoSelecionadoId,
  perfil,
  carregandoPerfil,
  camadasImportadas,
  aoAlterarCamadaBase,
  aoAlternarCamada,
  aoConsultarManual,
  aoSelecionarElemento,
  aoAnalisarPerfil,
  aoLimparAnalise,
  aoImportarArquivo,
  aoAlternarCamadaImportada,
  aoExportarRelatorio,
  aoExportarCsv,
  aoExportarGeoJson,
  aoExportarKml
}: PropriedadesPainelDireito) {
  const [latitude, setLatitude] = useState("-16.72");
  const [longitude, setLongitude] = useState("-43.86");
  const elementoSelecionado = elementos.find((elemento) => elemento.id === elementoSelecionadoId) ?? null;

  function enviarConsultaManual(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    aoConsultarManual(Number(latitude.replace(",", ".")), Number(longitude.replace(",", ".")));
  }

  return (
    <aside className="painel-direito">
      <SecaoPainel titulo="Camadas" icone={<Layers size={17} />}>
        <div className="grupo-controles">
          <span className="rotulo-bloco">Mapa base</span>
          <div className="controle-segmentado">
            {(["mapa", "satelite", "terreno"] as CamadaBase[]).map((camada) => (
              <button
                key={camada}
                type="button"
                className={camadaBase === camada ? "ativo" : ""}
                onClick={() => aoAlterarCamadaBase(camada)}
              >
                {camada === "mapa" ? "Mapa" : camada === "satelite" ? "Satélite" : "Terreno"}
              </button>
            ))}
          </div>
        </div>

        <div className="lista-checks">
          <label>
            <input
              type="checkbox"
              checked={camadasVisiveis.relevo}
              onChange={() => aoAlternarCamada("relevo")}
            />
            Relevo
          </label>
          <label>
            <input
              type="checkbox"
              checked={camadasVisiveis.gradeAltitude}
              onChange={() => aoAlternarCamada("gradeAltitude")}
            />
            Grade de altitude
          </label>
          <label>
            <input
              type="checkbox"
              checked={camadasVisiveis.importados}
              onChange={() => aoAlternarCamada("importados")}
            />
            KML/KMZ importado
          </label>
          <label>
            <input
              type="checkbox"
              checked={camadasVisiveis.desenhos}
              onChange={() => aoAlternarCamada("desenhos")}
            />
            Elementos desenhados
          </label>
        </div>
      </SecaoPainel>

      <SecaoPainel titulo="Ferramentas de desenho" icone={<Pencil size={17} />} abertaInicialmente={false}>
        <div className="grade-ferramentas">
          {ferramentasDesenho.map((ferramenta) => (
            <span key={ferramenta.nome} className="item-ferramenta">
              {ferramenta.icone}
              {ferramenta.nome}
            </span>
          ))}
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
        <form className="formulario-coordenadas" onSubmit={enviarConsultaManual}>
          <label>
            Latitude
            <input value={latitude} onChange={(evento) => setLatitude(evento.target.value)} />
          </label>
          <label>
            Longitude
            <input value={longitude} onChange={(evento) => setLongitude(evento.target.value)} />
          </label>
          <button type="submit">Consultar ponto</button>
        </form>

        <div className="resultado-atual">
          <span>Última altitude</span>
          <strong>{resultadoAtual ? formatarMetros(resultadoAtual.altitude, 2) : "-"}</strong>
          {resultadoAtual && (
            <small>
              Método: {resultadoAtual.metodo === "bilinear_parcial" ? "Bilinear parcial" : "Bilinear"} · Fonte:
              data10k8b.raw
            </small>
          )}
          <small>
            {resultadoAtual?.avisoPrecisao ??
              "Estimativa suavizada; a precisão real depende da resolução da fonte DEM."}
          </small>
          <small>{resultadoAtual?.mensagem ?? "Aguardando consulta."}</small>
        </div>

        <TabelaHistorico historico={historico} />
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
