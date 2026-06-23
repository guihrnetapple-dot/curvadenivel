import L from "leaflet";
import "leaflet-draw";
import { useEffect, useRef, useState } from "react";

import sombraMarcador from "leaflet/dist/images/marker-shadow.png";

import type {
  CamadaBase,
  CamadaImportada,
  CamadasVisiveis,
  BboxCurvasNivel,
  CurvasNivelGeoJson,
  ElementoMapa,
  GeometriaProjeto,
  LocalizacaoEncontrada,
  PontoPerfil,
  ResultadoAltitude,
  TemaVisual
} from "../tipos/altimetria";
import { consultarAltitude } from "../servicos/apiAltimetria";
import { formatarMetros, formatarNumero, gerarIdentificador } from "../utilitarios/formatacao";

const ZOOM_MAXIMO_MAPA = 24;
const ZOOM_NATIVO_OSM = 19;
const ZOOM_NATIVO_ESRI = 17;
const ZOOM_NATIVO_OPENTOPOMAP = 17;
const ATRASO_CONSULTA_CURSOR_MS = 420;
const CASAS_CACHE_CURSOR = 4;
const SVG_MARCADOR_VERMELHO = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41">
  <path fill="#dc2626" stroke="#991b1b" stroke-width="1.5" d="M12.5 1.25c-6.08 0-11 4.92-11 11 0 8.25 11 27.5 11 27.5s11-19.25 11-27.5c0-6.08-4.92-11-11-11Z"/>
  <circle cx="12.5" cy="12.25" r="4.1" fill="#fee2e2"/>
</svg>
`);
const URL_ICONE_MARCADOR_VERMELHO = `data:image/svg+xml;charset=UTF-8,${SVG_MARCADOR_VERMELHO}`;
const iconeMarcadorVermelho = L.icon({
  iconUrl: URL_ICONE_MARCADOR_VERMELHO,
  shadowUrl: sombraMarcador,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
const iconeControleRaioCirculo = L.divIcon({
  className: "controle-raio-circulo",
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: URL_ICONE_MARCADOR_VERMELHO,
  iconUrl: URL_ICONE_MARCADOR_VERMELHO,
  shadowUrl: sombraMarcador
});

interface PropriedadesMapaAltimetria {
  tema: TemaVisual;
  camadaBase: CamadaBase;
  rotulosMapaAtivos: boolean;
  localizacaoFocada: LocalizacaoEncontrada | null;
  elementoFocado: { id: string; versao: number } | null;
  aoAlterarCamadaBase: (camada: CamadaBase) => void;
  camadasVisiveis: CamadasVisiveis;
  elementos: ElementoMapa[];
  camadasImportadas: CamadaImportada[];
  curvasNivel: CurvasNivelGeoJson | null;
  visibilidadeCamadaCurvasNivel: boolean;
  pontoDestacado: PontoPerfil | null;
  elementoSelecionadoId: string | null;
  selecaoAreaCurvasAtiva: boolean;
  selecaoPontoAltitudeAtiva: boolean;
  aoElementoCriado: (elemento: ElementoMapa) => void;
  aoElementoAtualizado: (elemento: ElementoMapa) => void;
  aoElementoRemovido: (id: string) => void;
  aoSelecionarElemento: (id: string) => void;
  aoLimparSelecao: () => void;
  aoBoundsAlterado: (bounds: BboxCurvasNivel) => void;
  aoAreaCurvasSelecionada: (bounds: BboxCurvasNivel) => void;
  aoCancelarSelecaoAreaCurvas: () => void;
  aoPontoAltitudeSelecionado: (latitude: number, longitude: number) => void;
  aoCancelarSelecaoPontoAltitude: () => void;
}

const opcoesCamadaBase: Array<{ valor: CamadaBase; rotulo: string }> = [
  { valor: "mapa", rotulo: "Mapa" },
  { valor: "satelite", rotulo: "Satélite" },
  { valor: "terreno", rotulo: "Terreno" }
];

type StatusAltitudeCursor = "ocioso" | "carregando" | "valido" | "sem_dado" | "erro";

interface InformacoesCursor {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  altitudeVisaoMetros: number | null;
  statusAltitude: StatusAltitudeCursor;
}

interface AltitudeCacheCursor {
  altitude: number | null;
  statusAltitude: StatusAltitudeCursor;
}

interface EstadoDesenhoAreaCurvas {
  inicio: L.LatLng;
  retangulo: L.Rectangle;
}

type CamadaDesenho = L.Layer & {
  idElemento?: string;
  tipoElemento?: string;
  editing?: {
    enable: () => void;
    disable: () => void;
  };
  dragging?: {
    enable: () => void;
    disable: () => void;
  };
};

interface EstadoArrasteCamada {
  id: string;
  camada: L.Layer;
  tipo: string;
  ultimoPonto: L.LatLng;
  moveu: boolean;
}

interface EstadoRedimensionamentoCirculo {
  id: string;
  circulo: L.Circle;
  marcador: L.Marker;
}

const informacoesCursorIniciais: InformacoesCursor = {
  latitude: null,
  longitude: null,
  altitude: null,
  altitudeVisaoMetros: null,
  statusAltitude: "ocioso"
};

function configurarTextosDesenho() {
  const local = (L as unknown as { drawLocal?: Record<string, unknown> }).drawLocal;
  if (!local) {
    return;
  }

  const drawLocal = local as {
    draw: {
      toolbar: {
        buttons: Record<string, string>;
      };
    };
  };

  drawLocal.draw.toolbar.buttons.polyline = "Desenhar linha";
  drawLocal.draw.toolbar.buttons.polygon = "Desenhar polígono";
  drawLocal.draw.toolbar.buttons.rectangle = "Desenhar retângulo";
  drawLocal.draw.toolbar.buttons.circle = "Desenhar círculo";
  drawLocal.draw.toolbar.buttons.marker = "Adicionar marcador";
}

function criarCamadaBase(tipo: CamadaBase): L.TileLayer {
  if (tipo === "satelite") {
    return L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: ZOOM_MAXIMO_MAPA,
        maxNativeZoom: ZOOM_NATIVO_ESRI,
        attribution: "Tiles Esri"
      }
    );
  }

  if (tipo === "terreno") {
    return L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: ZOOM_MAXIMO_MAPA,
      maxNativeZoom: ZOOM_NATIVO_OPENTOPOMAP,
      attribution: "OpenTopoMap"
    });
  }

  return L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
    maxZoom: ZOOM_MAXIMO_MAPA,
    maxNativeZoom: ZOOM_NATIVO_OSM,
    attribution: "Tiles CARTO"
  });
}

function criarCamadaRotulos(): L.TileLayer {
  return L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png", {
    pane: "rotulos",
    maxZoom: ZOOM_MAXIMO_MAPA,
    maxNativeZoom: ZOOM_NATIVO_OSM,
    attribution: "Labels CARTO"
  });
}

function criarGradeAltitude(): L.LayerGroup {
  const grupo = L.layerGroup();
  for (let latitude = -90; latitude <= 90; latitude += 15) {
    L.polyline(
      [
        [latitude, -180],
        [latitude, 180]
      ],
      { color: "#1f6f8b", weight: 1, opacity: 0.28, dashArray: "4 8", interactive: false }
    ).addTo(grupo);
  }
  for (let longitude = -180; longitude <= 180; longitude += 15) {
    L.polyline(
      [
        [-90, longitude],
        [90, longitude]
      ],
      { color: "#1f6f8b", weight: 1, opacity: 0.28, dashArray: "4 8", interactive: false }
    ).addTo(grupo);
  }
  return grupo;
}

function criarChaveCursor(latitude: number, longitude: number): string {
  return `${latitude.toFixed(CASAS_CACHE_CURSOR)},${longitude.toFixed(CASAS_CACHE_CURSOR)}`;
}

function calcularAltitudeVisao(mapa: L.Map, latitude: number): number {
  const zoom = mapa.getZoom();
  const tamanho = mapa.getSize();
  const latitudeRad = (latitude * Math.PI) / 180;
  const metrosPorPixel = (156543.03392 * Math.cos(latitudeRad)) / 2 ** zoom;
  return Math.max(0, metrosPorPixel * Math.max(tamanho.x, tamanho.y) * 1.35);
}

function normalizarAltitudeCursor(resultado: ResultadoAltitude): AltitudeCacheCursor {
  if (resultado.status !== "valido" || resultado.altitude === null) {
    return {
      altitude: null,
      statusAltitude: "sem_dado"
    };
  }

  return {
    altitude: resultado.altitude,
    statusAltitude: "valido"
  };
}

function obterRotuloAltitudeCursor(info: InformacoesCursor): string {
  if (info.statusAltitude === "carregando") {
    return "calculando";
  }
  if (info.statusAltitude === "erro") {
    return "erro";
  }
  if (info.statusAltitude === "sem_dado") {
    return "sem dado";
  }
  return formatarMetros(info.altitude, 0);
}

function converterBounds(bounds: L.LatLngBounds): BboxCurvasNivel {
  const sulOeste = bounds.getSouthWest();
  const nordeste = bounds.getNorthEast();
  return {
    minLat: sulOeste.lat,
    minLng: sulOeste.lng,
    maxLat: nordeste.lat,
    maxLng: nordeste.lng
  };
}

function traduzirTipo(tipo: string): string {
  const nomes: Record<string, string> = {
    marker: "Marcador",
    polyline: "Linha",
    polygon: "Polígono",
    rectangle: "Retângulo",
    circle: "Círculo"
  };
  return nomes[tipo] ?? "Elemento";
}

function converterCamadaEmElemento(id: string, camada: L.Layer, tipo: string): ElementoMapa {
  let geometria: GeometriaProjeto;

  if (camada instanceof L.Circle) {
    const centro = camada.getLatLng();
    geometria = {
      type: "Circle",
      center: [centro.lng, centro.lat],
      radiusMeters: camada.getRadius()
    };
  } else if (camada instanceof L.Marker) {
    const ponto = camada.getLatLng();
    geometria = {
      type: "Point",
      coordinates: [ponto.lng, ponto.lat]
    };
  } else if (tipo === "rectangle" && camada instanceof L.Rectangle) {
    const bounds = camada.getBounds();
    const sulOeste = bounds.getSouthWest();
    const nordeste = bounds.getNorthEast();
    const noroeste = bounds.getNorthWest();
    const sudeste = bounds.getSouthEast();
    geometria = {
      type: "Polygon",
      coordinates: [
        [
          [sulOeste.lng, sulOeste.lat],
          [sudeste.lng, sudeste.lat],
          [nordeste.lng, nordeste.lat],
          [noroeste.lng, noroeste.lat],
          [sulOeste.lng, sulOeste.lat]
        ]
      ]
    };
  } else {
    const geojson = (camada as L.Layer & { toGeoJSON: () => { geometry: GeometriaProjeto } }).toGeoJSON();
    geometria = geojson.geometry;
  }

  return {
    id,
    nome: `${traduzirTipo(tipo)} ${new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    })}`,
    tipo: traduzirTipo(tipo),
    origem: "desenho",
    geometria,
    ativo: true,
    cor: "#2f6f4e",
    criadoEm: new Date().toISOString()
  };
}

function obterEstiloDesenho(tipo?: string, selecionado = false): L.PathOptions {
  if (selecionado) {
    return {
      color: "#2f8cff",
      fillColor: "#2f8cff",
      fillOpacity: 0.22,
      opacity: 1,
      weight: 4
    };
  }

  if (tipo === "circle") {
    return { color: "#c47a25", fillColor: "#c47a25", fillOpacity: 0.12, opacity: 1, weight: 2 };
  }

  if (tipo === "rectangle") {
    return { color: "#1f6f8b", fillColor: "#1f6f8b", fillOpacity: 0.12, opacity: 1, weight: 2 };
  }

  return { color: "#2f6f4e", fillColor: "#2f6f4e", fillOpacity: 0.12, opacity: 1, weight: 2 };
}

function obterTipoDesenhoPorElemento(elemento: ElementoMapa): string {
  if (elemento.geometria.type === "Point") {
    return "marker";
  }
  if (elemento.geometria.type === "LineString") {
    return "polyline";
  }
  if (elemento.geometria.type === "Circle") {
    return "circle";
  }
  return elemento.tipo.toLowerCase().includes("retângulo") ? "rectangle" : "polygon";
}

function criarCamadaPorElemento(elemento: ElementoMapa): L.Layer {
  if (elemento.geometria.type === "Point") {
    const [longitude, latitude] = elemento.geometria.coordinates;
    return L.marker([latitude, longitude], { icon: iconeMarcadorVermelho });
  }

  if (elemento.geometria.type === "LineString") {
    return L.polyline(
      elemento.geometria.coordinates.map(([longitude, latitude]) => [latitude, longitude] as L.LatLngTuple),
      obterEstiloDesenho("polyline")
    );
  }

  if (elemento.geometria.type === "Polygon") {
    const aneis = elemento.geometria.coordinates.map((anel) =>
      anel.map(([longitude, latitude]) => [latitude, longitude] as L.LatLngTuple)
    );
    return L.polygon(
      aneis,
      obterEstiloDesenho(obterTipoDesenhoPorElemento(elemento))
    );
  }

  const [longitude, latitude] = elemento.geometria.center;
  return L.circle([latitude, longitude], {
    ...obterEstiloDesenho("circle"),
    radius: elemento.geometria.radiusMeters
  });
}

function obterBoundsElemento(elemento: ElementoMapa): L.LatLngBounds | null {
  if (elemento.geometria.type === "Point") {
    return null;
  }

  if (elemento.geometria.type === "Circle") {
    const [longitude, latitude] = elemento.geometria.center;
    return L.circle([latitude, longitude], { radius: elemento.geometria.radiusMeters }).getBounds();
  }

  if (elemento.geometria.type === "LineString") {
    const pontos = elemento.geometria.coordinates.map(([longitude, latitude]) => [latitude, longitude] as L.LatLngTuple);
    return pontos.length > 0 ? L.latLngBounds(pontos) : null;
  }

  const pontos = elemento.geometria.coordinates
    .flat()
    .map(([longitude, latitude]) => [latitude, longitude] as L.LatLngTuple);
  return pontos.length > 0 ? L.latLngBounds(pontos) : null;
}

function obterCentroElemento(elemento: ElementoMapa): L.LatLng | null {
  if (elemento.geometria.type === "Point") {
    const [longitude, latitude] = elemento.geometria.coordinates;
    return L.latLng(latitude, longitude);
  }

  if (elemento.geometria.type === "Circle") {
    const [longitude, latitude] = elemento.geometria.center;
    return L.latLng(latitude, longitude);
  }

  return obterBoundsElemento(elemento)?.getCenter() ?? null;
}

function deslocarLatLng(latLng: L.LatLng, deltaLatitude: number, deltaLongitude: number): L.LatLng {
  return L.latLng(latLng.lat + deltaLatitude, latLng.lng + deltaLongitude);
}

function deslocarEstruturaLatLngs(valor: unknown, deltaLatitude: number, deltaLongitude: number): unknown {
  if (valor instanceof L.LatLng) {
    return deslocarLatLng(valor, deltaLatitude, deltaLongitude);
  }

  if (Array.isArray(valor)) {
    return valor.map((item) => deslocarEstruturaLatLngs(item, deltaLatitude, deltaLongitude));
  }

  return valor;
}

function moverCamada(camada: L.Layer, deltaLatitude: number, deltaLongitude: number): void {
  if (camada instanceof L.Circle) {
    camada.setLatLng(deslocarLatLng(camada.getLatLng(), deltaLatitude, deltaLongitude));
    return;
  }

  if (camada instanceof L.Marker) {
    camada.setLatLng(deslocarLatLng(camada.getLatLng(), deltaLatitude, deltaLongitude));
    return;
  }

  const camadaComLatLngs = camada as L.Polyline | L.Polygon;
  if ("getLatLngs" in camadaComLatLngs && "setLatLngs" in camadaComLatLngs) {
    camadaComLatLngs.setLatLngs(
      deslocarEstruturaLatLngs(camadaComLatLngs.getLatLngs(), deltaLatitude, deltaLongitude) as L.LatLngExpression[]
    );
  }
}

function elementoEdicaoLeaflet(alvo: EventTarget | null): boolean {
  return alvo instanceof HTMLElement && Boolean(alvo.closest(".leaflet-editing-icon, .controle-raio-circulo"));
}

function calcularPontoControleRaio(circulo: L.Circle): L.LatLng {
  const centro = circulo.getLatLng();
  const raioMetros = circulo.getRadius();
  const latitudeRad = (centro.lat * Math.PI) / 180;
  const metrosPorGrauLongitude = Math.max(1, 111320 * Math.cos(latitudeRad));
  return L.latLng(centro.lat, centro.lng + raioMetros / metrosPorGrauLongitude);
}

function alvoInterativo(evento: KeyboardEvent): boolean {
  const alvo = evento.target;
  if (!(alvo instanceof HTMLElement)) {
    return false;
  }

  return ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName) || alvo.isContentEditable;
}

export function MapaAltimetria({
  tema,
  camadaBase,
  rotulosMapaAtivos,
  localizacaoFocada,
  elementoFocado,
  aoAlterarCamadaBase,
  camadasVisiveis,
  elementos,
  camadasImportadas,
  curvasNivel,
  visibilidadeCamadaCurvasNivel,
  pontoDestacado,
  elementoSelecionadoId,
  selecaoAreaCurvasAtiva,
  selecaoPontoAltitudeAtiva,
  aoElementoCriado,
  aoElementoAtualizado,
  aoElementoRemovido,
  aoSelecionarElemento,
  aoLimparSelecao,
  aoBoundsAlterado,
  aoAreaCurvasSelecionada,
  aoCancelarSelecaoAreaCurvas,
  aoPontoAltitudeSelecionado,
  aoCancelarSelecaoPontoAltitude
}: PropriedadesMapaAltimetria) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const camadaBaseRef = useRef<L.TileLayer | null>(null);
  const camadaRotulosRef = useRef<L.TileLayer | null>(null);
  const desenhosRef = useRef<L.FeatureGroup | null>(null);
  const importadosRef = useRef<L.LayerGroup | null>(null);
  const curvasNivelRef = useRef<L.GeoJSON | null>(null);
  const gradeRef = useRef<L.LayerGroup | null>(null);
  const destaqueRef = useRef<L.CircleMarker | null>(null);
  const areaCurvasRef = useRef<L.Rectangle | null>(null);
  const desenhoAreaCurvasRef = useRef<EstadoDesenhoAreaCurvas | null>(null);
  const elementoSelecionadoIdRef = useRef(elementoSelecionadoId);
  const selecaoAreaCurvasAtivaRef = useRef(selecaoAreaCurvasAtiva);
  const selecaoPontoAltitudeAtivaRef = useRef(selecaoPontoAltitudeAtiva);
  const arrasteCamadaRef = useRef<EstadoArrasteCamada | null>(null);
  const controleRaioCirculoRef = useRef<EstadoRedimensionamentoCirculo | null>(null);
  const temporizadorEdicaoRef = useRef<number | null>(null);
  const cacheAltitudeCursorRef = useRef(new Map<string, AltitudeCacheCursor>());
  const temporizadorCursorRef = useRef<number | null>(null);
  const chaveCursorAtivaRef = useRef<string | null>(null);
  const propsRef = useRef({
    aoElementoCriado,
    aoElementoAtualizado,
    aoElementoRemovido,
    aoSelecionarElemento,
    aoLimparSelecao,
    aoBoundsAlterado,
    aoAreaCurvasSelecionada,
    aoCancelarSelecaoAreaCurvas,
    aoPontoAltitudeSelecionado,
    aoCancelarSelecaoPontoAltitude
  });
  const [informacoesCursor, setInformacoesCursor] = useState<InformacoesCursor>(informacoesCursorIniciais);
  const [seletorCamadaAberto, setSeletorCamadaAberto] = useState(false);
  const camadaBaseAtual = opcoesCamadaBase.find((opcao) => opcao.valor === camadaBase) ?? opcoesCamadaBase[0];

  function salvarCamadaAtualizada(camada: L.Layer, id: string, tipo: string) {
    propsRef.current.aoElementoAtualizado(converterCamadaEmElemento(id, camada, tipo));
  }

  function salvarCamadaAtualizadaComEspera(camada: L.Layer, id: string, tipo: string) {
    if (temporizadorEdicaoRef.current) {
      window.clearTimeout(temporizadorEdicaoRef.current);
    }

    temporizadorEdicaoRef.current = window.setTimeout(() => {
      salvarCamadaAtualizada(camada, id, tipo);
      temporizadorEdicaoRef.current = null;
    }, 250);
  }

  function aplicarEdicaoCamada(camada: L.Layer, selecionada: boolean) {
    const camadaDesenho = camada as CamadaDesenho;

    if (camada instanceof L.Circle) {
      camadaDesenho.editing?.disable();
      return;
    }

    if (selecionada) {
      camadaDesenho.editing?.enable();
      return;
    }

    camadaDesenho.editing?.disable();
    camadaDesenho.dragging?.disable();
  }

  function removerControleRaioCirculo() {
    const controle = controleRaioCirculoRef.current;
    if (!controle) {
      return;
    }

    controle.marcador.remove();
    controleRaioCirculoRef.current = null;
  }

  function atualizarControleRaioCirculo(circuloSelecionado: L.Circle | null, idSelecionado: string | null) {
    const mapa = mapaRef.current;
    removerControleRaioCirculo();

    if (!mapa || !circuloSelecionado || !idSelecionado) {
      return;
    }

    const marcador = L.marker(calcularPontoControleRaio(circuloSelecionado), {
      icon: iconeControleRaioCirculo,
      draggable: true,
      zIndexOffset: 1400
    }).addTo(mapa);

    marcador.on("mousedown click", (evento: L.LeafletEvent) => {
      L.DomEvent.stopPropagation(evento);
    });

    marcador.on("drag", () => {
      const novoRaio = Math.max(0.5, circuloSelecionado.getLatLng().distanceTo(marcador.getLatLng()));
      circuloSelecionado.setRadius(novoRaio);
    });

    marcador.on("dragend", () => {
      const novoRaio = Math.max(0.5, circuloSelecionado.getLatLng().distanceTo(marcador.getLatLng()));
      circuloSelecionado.setRadius(novoRaio);
      marcador.setLatLng(calcularPontoControleRaio(circuloSelecionado));
      salvarCamadaAtualizada(circuloSelecionado, idSelecionado, "circle");
    });

    controleRaioCirculoRef.current = {
      id: idSelecionado,
      circulo: circuloSelecionado,
      marcador
    };
  }

  function registrarCamadaDesenho(camada: L.Layer, id: string) {
    if (camada instanceof L.Path) {
      const tipo = (camada as CamadaDesenho).tipoElemento;
      camada.setStyle(obterEstiloDesenho(tipo));
    }

    camada.on("click", (evento: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(evento);
      if (selecaoAreaCurvasAtivaRef.current) {
        return;
      }
      propsRef.current.aoSelecionarElemento(id);
    });

    camada.on("contextmenu", (evento: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(evento);
      if (selecaoAreaCurvasAtivaRef.current) {
        return;
      }
      propsRef.current.aoSelecionarElemento(id);
    });

    camada.on("mousedown", (evento: L.LeafletMouseEvent) => {
      const camadaDesenho = camada as CamadaDesenho;
      const tipo = camadaDesenho.tipoElemento ?? "elemento";

      if (
        evento.originalEvent.button !== 0 ||
        elementoEdicaoLeaflet(evento.originalEvent.target) ||
        selecaoAreaCurvasAtivaRef.current ||
        selecaoPontoAltitudeAtivaRef.current ||
        elementoSelecionadoIdRef.current !== id
      ) {
        return;
      }

      L.DomEvent.stopPropagation(evento);
      mapaRef.current?.dragging.disable();
      arrasteCamadaRef.current = {
        id,
        camada,
        tipo,
        ultimoPonto: evento.latlng,
        moveu: false
      };
    });

    camada.on("edit", () => {
      const tipo = (camada as CamadaDesenho).tipoElemento ?? "elemento";
      salvarCamadaAtualizadaComEspera(camada, id, tipo);
    });
  }

  useEffect(() => {
    propsRef.current = {
      aoElementoCriado,
      aoElementoAtualizado,
      aoElementoRemovido,
      aoSelecionarElemento,
      aoLimparSelecao,
      aoBoundsAlterado,
      aoAreaCurvasSelecionada,
      aoCancelarSelecaoAreaCurvas,
      aoPontoAltitudeSelecionado,
      aoCancelarSelecaoPontoAltitude
    };
  }, [
    aoElementoCriado,
    aoElementoAtualizado,
    aoElementoRemovido,
    aoSelecionarElemento,
    aoLimparSelecao,
    aoBoundsAlterado,
    aoAreaCurvasSelecionada,
    aoCancelarSelecaoAreaCurvas,
    aoPontoAltitudeSelecionado,
    aoCancelarSelecaoPontoAltitude
  ]);

  useEffect(() => {
    selecaoAreaCurvasAtivaRef.current = selecaoAreaCurvasAtiva;
  }, [selecaoAreaCurvasAtiva]);

  useEffect(() => {
    elementoSelecionadoIdRef.current = elementoSelecionadoId;
  }, [elementoSelecionadoId]);

  useEffect(() => {
    selecaoPontoAltitudeAtivaRef.current = selecaoPontoAltitudeAtiva;
  }, [selecaoPontoAltitudeAtiva]);

  useEffect(() => {
    const grupoDesenhos = desenhosRef.current;
    if (!grupoDesenhos) {
      return;
    }

    let circuloSelecionado: L.Circle | null = null;
    let idCirculoSelecionado: string | null = null;

    grupoDesenhos.eachLayer((camada) => {
      const camadaDesenho = camada as CamadaDesenho;
      const selecionado = Boolean(camadaDesenho.idElemento && camadaDesenho.idElemento === elementoSelecionadoId);
      aplicarEdicaoCamada(camada, selecionado);

      if (selecionado && camada instanceof L.Circle && camadaDesenho.tipoElemento === "circle") {
        circuloSelecionado = camada;
        idCirculoSelecionado = camadaDesenho.idElemento ?? null;
      }

      if (camada instanceof L.Path) {
        camada.setStyle(obterEstiloDesenho(camadaDesenho.tipoElemento, selecionado));
        if (selecionado) {
          camada.bringToFront();
        }
      }

      if (camada instanceof L.Marker) {
        camada.setZIndexOffset(selecionado ? 1000 : 0);
        camada.setOpacity(selecionado ? 1 : 0.85);
      }
    });

    atualizarControleRaioCirculo(circuloSelecionado, idCirculoSelecionado);
  }, [elementoSelecionadoId]);

  useEffect(() => {
    const grupoDesenhos = desenhosRef.current;
    if (!grupoDesenhos) {
      return;
    }

    grupoDesenhos.clearLayers();
    let circuloSelecionado: L.Circle | null = null;
    let idCirculoSelecionado: string | null = null;

    elementos.forEach((elemento) => {
      const camada = criarCamadaPorElemento(elemento) as CamadaDesenho;
      camada.idElemento = elemento.id;
      camada.tipoElemento = obterTipoDesenhoPorElemento(elemento);
      grupoDesenhos.addLayer(camada);
      registrarCamadaDesenho(camada, elemento.id);

      const selecionado = elemento.id === elementoSelecionadoIdRef.current;
      aplicarEdicaoCamada(camada, selecionado);
      if (selecionado && camada instanceof L.Circle && (camada as CamadaDesenho).tipoElemento === "circle") {
        circuloSelecionado = camada;
        idCirculoSelecionado = elemento.id;
      }
      if (camada instanceof L.Path) {
        camada.setStyle(obterEstiloDesenho((camada as CamadaDesenho).tipoElemento, selecionado));
        if (selecionado) {
          camada.bringToFront();
        }
      }
      if (camada instanceof L.Marker) {
        camada.setZIndexOffset(selecionado ? 1000 : 0);
        camada.setOpacity(selecionado ? 1 : 0.85);
      }
    });

    atualizarControleRaioCirculo(circuloSelecionado, idCirculoSelecionado);
  }, [elementos]);

  useEffect(() => {
    function cancelarFerramentaDesenhoAtiva() {
      const mapa = mapaRef.current;
      const container = mapa?.getContainer().parentElement ?? document;
      const acoes = Array.from(container.querySelectorAll<HTMLAnchorElement>(".leaflet-draw-actions a"));
      const acaoCancelar =
        acoes.find((acao) => /cancel|cancelar/i.test(`${acao.title} ${acao.textContent}`)) ?? acoes[0] ?? null;
      acaoCancelar?.click();
    }

    function removerCamadaSelecionada() {
      const idSelecionado = elementoSelecionadoIdRef.current;
      const grupoDesenhos = desenhosRef.current;
      if (!idSelecionado || !grupoDesenhos) {
        return;
      }

      let camadaRemover: L.Layer | null = null;
      grupoDesenhos.eachLayer((camada) => {
        if ((camada as CamadaDesenho).idElemento === idSelecionado) {
          camadaRemover = camada;
        }
      });

      if (!camadaRemover) {
        return;
      }

      grupoDesenhos.removeLayer(camadaRemover);
      propsRef.current.aoElementoRemovido(idSelecionado);
    }

    function aoPressionarTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        cancelarFerramentaDesenhoAtiva();
        propsRef.current.aoLimparSelecao();
        propsRef.current.aoCancelarSelecaoAreaCurvas();
        propsRef.current.aoCancelarSelecaoPontoAltitude();
        return;
      }

      if (alvoInterativo(evento)) {
        return;
      }

      if (evento.key === "Delete" || evento.key === "Backspace") {
        if (!elementoSelecionadoIdRef.current) {
          return;
        }

        evento.preventDefault();
        removerCamadaSelecionada();
      }
    }

    window.addEventListener("keydown", aoPressionarTecla);
    return () => window.removeEventListener("keydown", aoPressionarTecla);
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapaRef.current) {
      return;
    }

    configurarTextosDesenho();
    const mapa = L.map(containerRef.current, {
      attributionControl: false,
      maxZoom: ZOOM_MAXIMO_MAPA,
      zoomControl: false,
      preferCanvas: true
    }).setView([-16.72, -43.86], 5);

    mapaRef.current = mapa;
    L.control.attribution({ position: "topright", prefix: false }).addTo(mapa);
    const painelRotulos = mapa.createPane("rotulos");
    painelRotulos.style.zIndex = "360";
    painelRotulos.style.pointerEvents = "none";
    camadaBaseRef.current = criarCamadaBase(camadaBase).addTo(mapa);
    if (rotulosMapaAtivos) {
      camadaRotulosRef.current = criarCamadaRotulos().addTo(mapa);
    }
    desenhosRef.current = L.featureGroup().addTo(mapa);
    importadosRef.current = L.layerGroup().addTo(mapa);

    L.control.zoom({ position: "bottomleft" }).addTo(mapa);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(mapa);
    const ControleDesenho = (L.Control as unknown as { Draw: new (opcoes: unknown) => L.Control }).Draw;
    const controleDesenho = new ControleDesenho({
      position: "topleft",
      draw: {
        circlemarker: false,
        polyline: { shapeOptions: { color: "#2f6f4e", weight: 3 } },
        polygon: { allowIntersection: false, shapeOptions: { color: "#2f6f4e", weight: 2 } },
        rectangle: false,
        circle: { shapeOptions: { color: "#c47a25", weight: 2 } },
        marker: { icon: iconeMarcadorVermelho }
      },
      edit: {
        featureGroup: desenhosRef.current
      }
    });
    mapa.addControl(controleDesenho);

    mapa.on("click", (evento: L.LeafletMouseEvent) => {
      if (selecaoAreaCurvasAtivaRef.current) {
        return;
      }

      if (document.querySelector(".leaflet-draw-toolbar-button-enabled")) {
        return;
      }

      if (!selecaoPontoAltitudeAtivaRef.current) {
        propsRef.current.aoLimparSelecao();
        return;
      }

      propsRef.current.aoPontoAltitudeSelecionado(evento.latlng.lat, evento.latlng.lng);
    });

    mapa.on((L as unknown as { Draw: { Event: { CREATED: string } } }).Draw.Event.CREATED, (evento: L.LeafletEvent) => {
      const eventoCriacao = evento as L.LeafletEvent & { layer: L.Layer; layerType: string };
      const id = gerarIdentificador("desenho");
      (eventoCriacao.layer as L.Layer & { idElemento?: string; tipoElemento?: string }).idElemento = id;
      (eventoCriacao.layer as L.Layer & { idElemento?: string; tipoElemento?: string }).tipoElemento =
        eventoCriacao.layerType;
      desenhosRef.current?.addLayer(eventoCriacao.layer);
      registrarCamadaDesenho(eventoCriacao.layer, id);
      propsRef.current.aoElementoCriado(converterCamadaEmElemento(id, eventoCriacao.layer, eventoCriacao.layerType));
      propsRef.current.aoSelecionarElemento(id);
    });

    mapa.on((L as unknown as { Draw: { Event: { EDITED: string } } }).Draw.Event.EDITED, (evento: L.LeafletEvent) => {
      const eventoEdicao = evento as L.LeafletEvent & { layers: L.LayerGroup };
      eventoEdicao.layers.eachLayer((camada: L.Layer) => {
        const metadados = camada as L.Layer & { idElemento?: string; tipoElemento?: string };
        if (metadados.idElemento) {
          propsRef.current.aoElementoAtualizado(
            converterCamadaEmElemento(metadados.idElemento, camada, metadados.tipoElemento ?? "elemento")
          );
        }
      });
    });

    mapa.on((L as unknown as { Draw: { Event: { DELETED: string } } }).Draw.Event.DELETED, (evento: L.LeafletEvent) => {
      const eventoRemocao = evento as L.LeafletEvent & { layers: L.LayerGroup };
      eventoRemocao.layers.eachLayer((camada: L.Layer) => {
        const id = (camada as L.Layer & { idElemento?: string }).idElemento;
        if (id) {
          propsRef.current.aoElementoRemovido(id);
        }
      });
    });

    mapa.on("mousemove", (evento: L.LeafletMouseEvent) => {
      const arrasteCamada = arrasteCamadaRef.current;
      if (arrasteCamada) {
        const deltaLatitude = evento.latlng.lat - arrasteCamada.ultimoPonto.lat;
        const deltaLongitude = evento.latlng.lng - arrasteCamada.ultimoPonto.lng;
        moverCamada(arrasteCamada.camada, deltaLatitude, deltaLongitude);
        if (arrasteCamada.camada instanceof L.Circle && controleRaioCirculoRef.current?.id === arrasteCamada.id) {
          controleRaioCirculoRef.current.marcador.setLatLng(calcularPontoControleRaio(arrasteCamada.camada));
        }
        arrasteCamada.ultimoPonto = evento.latlng;
        arrasteCamada.moveu = true;
        return;
      }

      if (selecaoAreaCurvasAtivaRef.current) {
        return;
      }

      const latitude = evento.latlng.lat;
      const longitude = evento.latlng.lng;
      const chaveCursor = criarChaveCursor(latitude, longitude);
      const altitudeEmCache = cacheAltitudeCursorRef.current.get(chaveCursor);

      setInformacoesCursor({
        latitude,
        longitude,
        altitude: altitudeEmCache?.altitude ?? null,
        altitudeVisaoMetros: calcularAltitudeVisao(mapa, latitude),
        statusAltitude: altitudeEmCache?.statusAltitude ?? "carregando"
      });

      if (altitudeEmCache) {
        return;
      }

      if (temporizadorCursorRef.current) {
        window.clearTimeout(temporizadorCursorRef.current);
      }

      chaveCursorAtivaRef.current = chaveCursor;
      temporizadorCursorRef.current = window.setTimeout(async () => {
        try {
          const resultado = await consultarAltitude(latitude, longitude);
          const altitudeNormalizada = normalizarAltitudeCursor(resultado);
          cacheAltitudeCursorRef.current.set(chaveCursor, altitudeNormalizada);

          if (chaveCursorAtivaRef.current === chaveCursor) {
            setInformacoesCursor((estadoAtual) => ({
              ...estadoAtual,
              altitude: altitudeNormalizada.altitude,
              statusAltitude: altitudeNormalizada.statusAltitude
            }));
          }
        } catch {
          const altitudeErro: AltitudeCacheCursor = {
            altitude: null,
            statusAltitude: "erro"
          };
          cacheAltitudeCursorRef.current.set(chaveCursor, altitudeErro);

          if (chaveCursorAtivaRef.current === chaveCursor) {
            setInformacoesCursor((estadoAtual) => ({
              ...estadoAtual,
              altitude: null,
              statusAltitude: "erro"
            }));
          }
        }
      }, ATRASO_CONSULTA_CURSOR_MS);
    });

    mapa.on("mouseup", () => {
      const arrasteCamada = arrasteCamadaRef.current;
      if (!arrasteCamada) {
        return;
      }

      mapa.dragging.enable();
      arrasteCamadaRef.current = null;

      if (arrasteCamada.moveu) {
        salvarCamadaAtualizada(arrasteCamada.camada, arrasteCamada.id, arrasteCamada.tipo);
      }
    });

    function notificarBounds() {
      propsRef.current.aoBoundsAlterado(converterBounds(mapa.getBounds()));
    }

    mapa.on("moveend zoomend", notificarBounds);
    notificarBounds();

    return () => {
      if (temporizadorCursorRef.current) {
        window.clearTimeout(temporizadorCursorRef.current);
      }
      mapa.remove();
      mapaRef.current = null;
      desenhoAreaCurvasRef.current = null;
      removerControleRaioCirculo();
    };
  }, []);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) {
      return;
    }
    const mapaAtual = mapa;
    const containerMapa = mapaAtual.getContainer();
    const grupoDesenhos = desenhosRef.current;

    function limparModoSelecaoAreaCurvas() {
      containerMapa.classList.remove("modo-desenho-area-curvas");
      if (desenhoAreaCurvasRef.current) {
        desenhoAreaCurvasRef.current.retangulo.removeFrom(mapaAtual);
        desenhoAreaCurvasRef.current = null;
      }
      mapaAtual.dragging.enable();
      grupoDesenhos?.eachLayer((camada) => {
        const camadaComOpcoes = camada as L.Layer & { options?: L.InteractiveLayerOptions };
        if (camadaComOpcoes.options) {
          camadaComOpcoes.options.interactive = true;
        }
      });
    }

    if (!selecaoAreaCurvasAtiva) {
      limparModoSelecaoAreaCurvas();
      return;
    }

    const estiloAreaTemporaria: L.PathOptions = {
      color: "#37e749",
      fillColor: "#37e749",
      fillOpacity: 0.16,
      weight: 2,
      dashArray: "6 4"
    };

    containerMapa.classList.add("modo-desenho-area-curvas");
    mapaAtual.dragging.disable();
    grupoDesenhos?.eachLayer((camada) => {
      const camadaComOpcoes = camada as L.Layer & { options?: L.InteractiveLayerOptions };
      if (camadaComOpcoes.options) {
        camadaComOpcoes.options.interactive = false;
      }
    });

    function iniciarDesenho(evento: L.LeafletMouseEvent) {
      if (evento.originalEvent.button !== 0) {
        return;
      }

      L.DomEvent.stopPropagation(evento);
      L.DomEvent.preventDefault(evento.originalEvent);

      if (areaCurvasRef.current) {
        areaCurvasRef.current.removeFrom(mapaAtual);
        areaCurvasRef.current = null;
      }

      const retangulo = L.rectangle(L.latLngBounds(evento.latlng, evento.latlng), estiloAreaTemporaria).addTo(mapaAtual);
      desenhoAreaCurvasRef.current = {
        inicio: evento.latlng,
        retangulo
      };
    }

    function atualizarDesenho(evento: L.LeafletMouseEvent) {
      const desenhoArea = desenhoAreaCurvasRef.current;
      if (!desenhoArea) {
        return;
      }

      desenhoArea.retangulo.setBounds(L.latLngBounds(desenhoArea.inicio, evento.latlng));
    }

    function finalizarDesenho(evento: MouseEvent) {
      const desenhoArea = desenhoAreaCurvasRef.current;
      if (!desenhoArea) {
        return;
      }

      evento.preventDefault();
      evento.stopPropagation();

      const pontoContainer = mapaAtual.mouseEventToContainerPoint(evento);
      const latLngFinal = mapaAtual.containerPointToLatLng(pontoContainer);
      desenhoArea.retangulo.setBounds(L.latLngBounds(desenhoArea.inicio, latLngFinal));
      const bounds = desenhoArea.retangulo.getBounds();
      const areaValida =
        Math.abs(bounds.getNorth() - bounds.getSouth()) > 0.000001 &&
        Math.abs(bounds.getEast() - bounds.getWest()) > 0.000001;

      if (!areaValida) {
        desenhoArea.retangulo.removeFrom(mapaAtual);
        desenhoAreaCurvasRef.current = null;
        limparModoSelecaoAreaCurvas();
        propsRef.current.aoCancelarSelecaoAreaCurvas();
        return;
      }

      desenhoArea.retangulo.setStyle({
        color: "#37e749",
        fillColor: "#37e749",
        fillOpacity: 0.08,
        weight: 2,
        dashArray: undefined
      });
      areaCurvasRef.current = desenhoArea.retangulo;
      desenhoAreaCurvasRef.current = null;
      limparModoSelecaoAreaCurvas();
      propsRef.current.aoAreaCurvasSelecionada(converterBounds(bounds));
    }

    mapaAtual.on("mousedown", iniciarDesenho);
    mapaAtual.on("mousemove", atualizarDesenho);
    window.addEventListener("mouseup", finalizarDesenho, true);

    return () => {
      mapaAtual.off("mousedown", iniciarDesenho);
      mapaAtual.off("mousemove", atualizarDesenho);
      window.removeEventListener("mouseup", finalizarDesenho, true);
      limparModoSelecaoAreaCurvas();
    };
  }, [selecaoAreaCurvasAtiva]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) {
      return;
    }

    if (selecaoPontoAltitudeAtiva) {
      mapa.getContainer().classList.add("modo-selecao-ponto-altitude");
    } else {
      mapa.getContainer().classList.remove("modo-selecao-ponto-altitude");
    }

    return () => {
      mapa.getContainer().classList.remove("modo-selecao-ponto-altitude");
    };
  }, [selecaoPontoAltitudeAtiva]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) {
      return;
    }

    if (camadaBaseRef.current) {
      mapa.removeLayer(camadaBaseRef.current);
    }
    camadaBaseRef.current = criarCamadaBase(camadaBase).addTo(mapa);
    camadaBaseRef.current.bringToBack();
  }, [camadaBase, tema]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) {
      return;
    }

    if (camadaRotulosRef.current) {
      mapa.removeLayer(camadaRotulosRef.current);
      camadaRotulosRef.current = null;
    }

    if (rotulosMapaAtivos) {
      camadaRotulosRef.current = criarCamadaRotulos().addTo(mapa);
    }
  }, [rotulosMapaAtivos, camadaBase]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !localizacaoFocada) {
      return;
    }

    if (localizacaoFocada.bbox) {
      mapa.fitBounds(
        [
          [localizacaoFocada.bbox.minLat, localizacaoFocada.bbox.minLng],
          [localizacaoFocada.bbox.maxLat, localizacaoFocada.bbox.maxLng]
        ],
        { maxZoom: 15, padding: [36, 36], animate: true }
      );
      return;
    }

    mapa.flyTo([localizacaoFocada.latitude, localizacaoFocada.longitude], 13, { animate: true });
  }, [localizacaoFocada]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !elementoFocado) {
      return;
    }

    const elemento = elementos.find((item) => item.id === elementoFocado.id);
    if (!elemento) {
      return;
    }

    const bounds = obterBoundsElemento(elemento);
    if (bounds?.isValid()) {
      mapa.fitBounds(bounds, { maxZoom: 18, padding: [56, 56], animate: true });
      return;
    }

    const centro = obterCentroElemento(elemento);
    if (centro) {
      mapa.flyTo(centro, Math.max(mapa.getZoom(), 16), { animate: true });
    }
  }, [elementoFocado]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !desenhosRef.current) {
      return;
    }
    if (camadasVisiveis.desenhos) {
      desenhosRef.current.addTo(mapa);
    } else {
      desenhosRef.current.removeFrom(mapa);
    }
  }, [camadasVisiveis.desenhos]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) {
      return;
    }

    if (!gradeRef.current) {
      gradeRef.current = criarGradeAltitude();
    }

    if (camadasVisiveis.gradeAltitude) {
      gradeRef.current.addTo(mapa);
    } else {
      gradeRef.current.removeFrom(mapa);
    }
  }, [camadasVisiveis.gradeAltitude]);

  useEffect(() => {
    const mapa = mapaRef.current;
    const grupoImportados = importadosRef.current;
    if (!mapa || !grupoImportados) {
      return;
    }

    grupoImportados.clearLayers();
    if (!camadasVisiveis.importados) {
      return;
    }

    for (const camada of camadasImportadas.filter((item) => item.ativa)) {
      L.geoJSON(camada.geojson as GeoJSON.GeoJsonObject, {
        style: {
          color: "#1f6f8b",
          weight: 2,
          fillOpacity: 0.12
        },
        pointToLayer: (_feature, latlng) =>
          L.circleMarker(latlng, {
            radius: 6,
            color: "#1f6f8b",
            weight: 2,
            fillColor: "#f8fbf5",
            fillOpacity: 0.9
          })
      }).addTo(grupoImportados);
    }
  }, [camadasImportadas, camadasVisiveis.importados]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) {
      return;
    }

    if (curvasNivelRef.current) {
      curvasNivelRef.current.removeFrom(mapa);
      curvasNivelRef.current = null;
    }

    if (!visibilidadeCamadaCurvasNivel || !curvasNivel || curvasNivel.features.length === 0) {
      return;
    }

    curvasNivelRef.current = L.geoJSON(curvasNivel as unknown as GeoJSON.GeoJsonObject, {
      style: (feature) => {
        const tipo = feature?.properties?.tipo;
        return tipo === "mestra"
          ? {
              color: "#dc2626",
              weight: 2.4,
              opacity: 0.95,
              lineCap: "round",
              lineJoin: "round",
              smoothFactor: 0.2,
              interactive: true,
              className: "curva-nivel-mestra"
            }
          : {
              color: "#f97316",
              weight: 1.4,
              opacity: 0.88,
              lineCap: "round",
              lineJoin: "round",
              smoothFactor: 0.2,
              interactive: true,
              className: "curva-nivel-normal"
            };
      },
      onEachFeature: (feature, camada) => {
        const elevacao = Number(feature.properties?.elevacao);
        const tipo = String(feature.properties?.tipo ?? "-");
        const comprimento = Number(feature.properties?.comprimentoMetros);
        const resolucao = curvasNivel.metadados.resolucaoEfetivaMetros;
        camada.bindPopup(`
          <div class="popup-tecnico">
            <strong>Curva de nível: ${formatarMetros(elevacao, 0)}</strong>
            <dl>
              <dt>Tipo</dt><dd>${tipo === "mestra" ? "Mestra" : "Normal"}</dd>
              <dt>Comprimento</dt><dd>${formatarMetros(comprimento, 0)}</dd>
              <dt>Resolução efetiva</dt><dd>${formatarMetros(resolucao, 0)}</dd>
            </dl>
          </div>
        `);
        camada.on("click", (evento) => {
          L.DomEvent.stopPropagation(evento);
        });
      }
    }).addTo(mapa);

    desenhosRef.current?.bringToFront();
  }, [curvasNivel, visibilidadeCamadaCurvasNivel]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) {
      return;
    }

    if (destaqueRef.current) {
      destaqueRef.current.removeFrom(mapa);
      destaqueRef.current = null;
    }

    if (pontoDestacado) {
      destaqueRef.current = L.circleMarker([pontoDestacado.latitude, pontoDestacado.longitude], {
        radius: 9,
        color: "#c47a25",
        fillColor: "#f5b451",
        fillOpacity: 0.85,
        weight: 2
      }).addTo(mapa);
      mapa.panTo([pontoDestacado.latitude, pontoDestacado.longitude], { animate: true });
    }
  }, [pontoDestacado]);

  return (
    <section className="mapa-container">
      <div ref={containerRef} className="mapa-altimetria" />
      <div className="seletor-camada-mapa" onClick={(evento) => evento.stopPropagation()}>
        <button
          className="botao-camada-mapa"
          type="button"
          aria-haspopup="menu"
          aria-expanded={seletorCamadaAberto}
          onClick={() => setSeletorCamadaAberto((aberto) => !aberto)}
        >
          {camadaBaseAtual.rotulo}
        </button>
        {seletorCamadaAberto && (
          <div className="menu-camada-mapa" role="menu">
            {opcoesCamadaBase.map((opcao) => (
              <button
                key={opcao.valor}
                type="button"
                role="menuitemradio"
                aria-checked={opcao.valor === camadaBase}
                className={opcao.valor === camadaBase ? "ativo" : ""}
                onClick={() => {
                  aoAlterarCamadaBase(opcao.valor);
                  setSeletorCamadaAberto(false);
                }}
              >
                {opcao.rotulo}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="sobreposicao-mapa cursor-mapa barra-informacoes-mapa">
        <span>lat {formatarNumero(informacoesCursor.latitude, 6)}°</span>
        <span>lon {formatarNumero(informacoesCursor.longitude, 6)}°</span>
      </div>
    </section>
  );
}

