import L from "leaflet";
import "leaflet-draw";
import { useEffect, useRef, useState } from "react";

import iconeMarcador2x from "leaflet/dist/images/marker-icon-2x.png";
import iconeMarcador from "leaflet/dist/images/marker-icon.png";
import sombraMarcador from "leaflet/dist/images/marker-shadow.png";

import type {
  CamadaBase,
  CamadaImportada,
  CamadasVisiveis,
  BboxCurvasNivel,
  CurvasNivelGeoJson,
  ElementoMapa,
  GeometriaProjeto,
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

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconeMarcador2x,
  iconUrl: iconeMarcador,
  shadowUrl: sombraMarcador
});

interface PropriedadesMapaAltimetria {
  tema: TemaVisual;
  camadaBase: CamadaBase;
  aoAlterarCamadaBase: (camada: CamadaBase) => void;
  camadasVisiveis: CamadasVisiveis;
  camadasImportadas: CamadaImportada[];
  curvasNivel: CurvasNivelGeoJson | null;
  pontoDestacado: PontoPerfil | null;
  elementoSelecionadoId: string | null;
  selecaoAreaCurvasAtiva: boolean;
  selecaoPontoAltitudeAtiva: boolean;
  aoElementoCriado: (elemento: ElementoMapa) => void;
  aoElementoAtualizado: (elemento: ElementoMapa) => void;
  aoElementoRemovido: (id: string) => void;
  aoSelecionarElemento: (id: string) => void;
  aoBoundsAlterado: (bounds: BboxCurvasNivel) => void;
  aoAreaCurvasSelecionada: (bounds: BboxCurvasNivel) => void;
  aoCancelarSelecaoAreaCurvas: () => void;
  aoPontoAltitudeSelecionado: (latitude: number, longitude: number) => void;
  aoCancelarSelecaoPontoAltitude: () => void;
}

const opcoesCamadaBase: Array<{ valor: CamadaBase; rotulo: string }> = [
  { valor: "mapa", rotulo: "Mapa" },
  { valor: "satelite", rotulo: "SatÃ©lite" },
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
};

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
  drawLocal.draw.toolbar.buttons.polygon = "Desenhar polÃ­gono";
  drawLocal.draw.toolbar.buttons.rectangle = "Desenhar retÃ¢ngulo";
  drawLocal.draw.toolbar.buttons.circle = "Desenhar cÃ­rculo";
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

  return L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: ZOOM_MAXIMO_MAPA,
    maxNativeZoom: ZOOM_NATIVO_OSM,
    attribution: "OpenStreetMap"
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
    polygon: "PolÃ­gono",
    rectangle: "RetÃ¢ngulo",
    circle: "CÃ­rculo"
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
  aoAlterarCamadaBase,
  camadasVisiveis,
  camadasImportadas,
  curvasNivel,
  pontoDestacado,
  elementoSelecionadoId,
  selecaoAreaCurvasAtiva,
  selecaoPontoAltitudeAtiva,
  aoElementoCriado,
  aoElementoAtualizado,
  aoElementoRemovido,
  aoSelecionarElemento,
  aoBoundsAlterado,
  aoAreaCurvasSelecionada,
  aoCancelarSelecaoAreaCurvas,
  aoPontoAltitudeSelecionado,
  aoCancelarSelecaoPontoAltitude
}: PropriedadesMapaAltimetria) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const camadaBaseRef = useRef<L.TileLayer | null>(null);
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
  const cacheAltitudeCursorRef = useRef(new Map<string, AltitudeCacheCursor>());
  const temporizadorCursorRef = useRef<number | null>(null);
  const chaveCursorAtivaRef = useRef<string | null>(null);
  const propsRef = useRef({
    aoElementoCriado,
    aoElementoAtualizado,
    aoElementoRemovido,
    aoSelecionarElemento,
    aoBoundsAlterado,
    aoAreaCurvasSelecionada,
    aoCancelarSelecaoAreaCurvas,
    aoPontoAltitudeSelecionado,
    aoCancelarSelecaoPontoAltitude
  });
  const [informacoesCursor, setInformacoesCursor] = useState<InformacoesCursor>(informacoesCursorIniciais);
  const [seletorCamadaAberto, setSeletorCamadaAberto] = useState(false);
  const camadaBaseAtual = opcoesCamadaBase.find((opcao) => opcao.valor === camadaBase) ?? opcoesCamadaBase[0];

  useEffect(() => {
    propsRef.current = {
      aoElementoCriado,
      aoElementoAtualizado,
      aoElementoRemovido,
      aoSelecionarElemento,
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

    grupoDesenhos.eachLayer((camada) => {
      const camadaDesenho = camada as CamadaDesenho;
      const selecionado = Boolean(camadaDesenho.idElemento && camadaDesenho.idElemento === elementoSelecionadoId);

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
  }, [elementoSelecionadoId]);

  useEffect(() => {
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
      if ((evento.key !== "Delete" && evento.key !== "Backspace") || alvoInterativo(evento)) {
        return;
      }

      if (!elementoSelecionadoIdRef.current) {
        return;
      }

      evento.preventDefault();
      removerCamadaSelecionada();
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
    camadaBaseRef.current = criarCamadaBase(camadaBase).addTo(mapa);
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
        rectangle: { shapeOptions: { color: "#1f6f8b", weight: 2 } },
        circle: { shapeOptions: { color: "#c47a25", weight: 2 } },
        marker: true
      },
      edit: {
        featureGroup: desenhosRef.current
      }
    });
    mapa.addControl(controleDesenho);

    function registrarCamada(camada: L.Layer, id: string) {
      if (camada instanceof L.Path) {
        const tipo = (camada as CamadaDesenho).tipoElemento;
        camada.setStyle(obterEstiloDesenho(tipo));
      }

      camada.on("click", (evento: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(evento);
        propsRef.current.aoSelecionarElemento(id);
      });
    }

    mapa.on("click", (evento: L.LeafletMouseEvent) => {
      if (!selecaoPontoAltitudeAtivaRef.current || selecaoAreaCurvasAtivaRef.current) {
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
      registrarCamada(eventoCriacao.layer, id);
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
    };
  }, []);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) {
      return;
    }
    const mapaAtual = mapa;

    if (!selecaoAreaCurvasAtiva) {
      mapaAtual.getContainer().classList.remove("modo-desenho-area-curvas");
      if (desenhoAreaCurvasRef.current) {
        desenhoAreaCurvasRef.current.retangulo.removeFrom(mapaAtual);
        desenhoAreaCurvasRef.current = null;
      }
      mapaAtual.dragging.enable();
      return;
    }

    const estiloAreaTemporaria: L.PathOptions = {
      color: "#37e749",
      fillColor: "#37e749",
      fillOpacity: 0.16,
      weight: 2,
      dashArray: "6 4"
    };

    mapaAtual.getContainer().classList.add("modo-desenho-area-curvas");
    mapaAtual.dragging.disable();

    function iniciarDesenho(evento: L.LeafletMouseEvent) {
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

    function finalizarDesenho(evento: L.LeafletMouseEvent) {
      const desenhoArea = desenhoAreaCurvasRef.current;
      if (!desenhoArea) {
        return;
      }

      desenhoArea.retangulo.setBounds(L.latLngBounds(desenhoArea.inicio, evento.latlng));
      const bounds = desenhoArea.retangulo.getBounds();
      const areaValida =
        Math.abs(bounds.getNorth() - bounds.getSouth()) > 0.000001 &&
        Math.abs(bounds.getEast() - bounds.getWest()) > 0.000001;

      if (!areaValida) {
        desenhoArea.retangulo.removeFrom(mapaAtual);
        desenhoAreaCurvasRef.current = null;
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
      propsRef.current.aoAreaCurvasSelecionada(converterBounds(bounds));
    }

    mapaAtual.on("mousedown", iniciarDesenho);
    mapaAtual.on("mousemove", atualizarDesenho);
    mapaAtual.on("mouseup", finalizarDesenho);

    return () => {
      mapaAtual.off("mousedown", iniciarDesenho);
      mapaAtual.off("mousemove", atualizarDesenho);
      mapaAtual.off("mouseup", finalizarDesenho);
      mapaAtual.getContainer().classList.remove("modo-desenho-area-curvas");
      mapaAtual.dragging.enable();
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

    if (!curvasNivel || curvasNivel.features.length === 0) {
      return;
    }

    curvasNivelRef.current = L.geoJSON(curvasNivel as unknown as GeoJSON.GeoJsonObject, {
      style: (feature) => {
        const tipo = feature?.properties?.tipo;
        return tipo === "mestra"
          ? {
              color: "#5f3d22",
              weight: 2.4,
              opacity: 0.95,
              lineCap: "round",
              lineJoin: "round",
              smoothFactor: 0.2,
              interactive: true,
              className: "curva-nivel-mestra"
            }
          : {
              color: "#9a7448",
              weight: 1.4,
              opacity: 0.78,
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
        const fonte = String(feature.properties?.fonte ?? "Open-Elevation");
        const comprimento = Number(feature.properties?.comprimentoMetros);
        const resolucao = curvasNivel.metadados.resolucaoEfetivaMetros;
        camada.bindPopup(`
          <div class="popup-tecnico">
            <strong>Curva de nível: ${formatarMetros(elevacao, 0)}</strong>
            <dl>
              <dt>Tipo</dt><dd>${tipo === "mestra" ? "Mestra" : "Normal"}</dd>
              <dt>Comprimento</dt><dd>${formatarMetros(comprimento, 0)}</dd>
              <dt>Fonte</dt><dd>${fonte}</dd>
              <dt>Resolução efetiva</dt><dd>${formatarMetros(resolucao, 0)}</dd>
            </dl>
          </div>
        `);
        camada.on("click", (evento) => {
          L.DomEvent.stopPropagation(evento);
        });
      }
    }).addTo(mapa);
  }, [curvasNivel]);

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
        <span>Data das imagens: nÃ£o disponÃ­vel</span>
        <span>lat {formatarNumero(informacoesCursor.latitude, 6)}Â°</span>
        <span>lon {formatarNumero(informacoesCursor.longitude, 6)}Â°</span>
        <span>altitude do ponto de visÃ£o {formatarMetros(informacoesCursor.altitudeVisaoMetros, 2)}</span>
      </div>
    </section>
  );
}

