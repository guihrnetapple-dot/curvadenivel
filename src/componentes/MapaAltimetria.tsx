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
import { formatarDataHoraIso, formatarMetros, formatarNumero, gerarIdentificador } from "../utilitarios/formatacao";

const ZOOM_MAXIMO_MAPA = 24;
const ZOOM_NATIVO_OSM = 19;
const ZOOM_NATIVO_ESRI = 17;
const ZOOM_NATIVO_OPENTOPOMAP = 17;

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconeMarcador2x,
  iconUrl: iconeMarcador,
  shadowUrl: sombraMarcador
});

interface PropriedadesMapaAltimetria {
  tema: TemaVisual;
  camadaBase: CamadaBase;
  camadasVisiveis: CamadasVisiveis;
  camadasImportadas: CamadaImportada[];
  curvasNivel: CurvasNivelGeoJson | null;
  pontoDestacado: PontoPerfil | null;
  aoConsultarCoordenada: (latitude: number, longitude: number) => Promise<ResultadoAltitude | null>;
  aoElementoCriado: (elemento: ElementoMapa) => void;
  aoElementoAtualizado: (elemento: ElementoMapa) => void;
  aoElementoRemovido: (id: string) => void;
  aoSelecionarElemento: (id: string) => void;
  aoBoundsAlterado: (bounds: BboxCurvasNivel) => void;
}

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

function montarPopup(resultado: ResultadoAltitude): string {
  const classeStatus = resultado.status === "valido" ? "valido" : "sem-dado";
  const metodo = resultado.metodo === "bilinear_parcial" ? "Bilinear parcial" : "Bilinear";
  const status = resultado.status === "valido" ? "Válido" : "Água ou sem dado";
  return `
    <div class="popup-tecnico">
      <strong>Consulta altimétrica</strong>
      <dl>
        <dt>Latitude</dt><dd>${formatarNumero(resultado.latitude, 6)}</dd>
        <dt>Longitude</dt><dd>${formatarNumero(resultado.longitude, 6)}</dd>
        <dt>Altitude</dt><dd>${formatarMetros(resultado.altitude, 2)}</dd>
        <dt>Método</dt><dd>${metodo}</dd>
        <dt>Fonte</dt><dd>data10k8b.raw</dd>
        <dt>Valor bruto</dt><dd>${resultado.valorBruto}</dd>
        <dt>Bruto interpolado</dt><dd>${formatarNumero(resultado.valorBrutoInterpolado, 4)}</dd>
        <dt>Status</dt><dd><span class="marcador-status ${classeStatus}">${status}</span></dd>
        <dt>Observação</dt><dd>${resultado.avisoPrecisao ?? "Estimativa suavizada, baixa resolução real."}</dd>
        <dt>Data/hora</dt><dd>${formatarDataHoraIso(resultado.consultadoEm)}</dd>
      </dl>
    </div>
  `;
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

export function MapaAltimetria({
  tema,
  camadaBase,
  camadasVisiveis,
  camadasImportadas,
  curvasNivel,
  pontoDestacado,
  aoConsultarCoordenada,
  aoElementoCriado,
  aoElementoAtualizado,
  aoElementoRemovido,
  aoSelecionarElemento,
  aoBoundsAlterado
}: PropriedadesMapaAltimetria) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const camadaBaseRef = useRef<L.TileLayer | null>(null);
  const desenhosRef = useRef<L.FeatureGroup | null>(null);
  const importadosRef = useRef<L.LayerGroup | null>(null);
  const curvasNivelRef = useRef<L.GeoJSON | null>(null);
  const gradeRef = useRef<L.LayerGroup | null>(null);
  const relevoRef = useRef<L.TileLayer | null>(null);
  const destaqueRef = useRef<L.CircleMarker | null>(null);
  const propsRef = useRef({
    aoConsultarCoordenada,
    aoElementoCriado,
    aoElementoAtualizado,
    aoElementoRemovido,
    aoSelecionarElemento,
    aoBoundsAlterado
  });
  const [coordenadasCursor, setCoordenadasCursor] = useState("Lat -, Lng -");

  useEffect(() => {
    propsRef.current = {
      aoConsultarCoordenada,
      aoElementoCriado,
      aoElementoAtualizado,
      aoElementoRemovido,
      aoSelecionarElemento,
      aoBoundsAlterado
    };
  }, [
    aoConsultarCoordenada,
    aoElementoCriado,
    aoElementoAtualizado,
    aoElementoRemovido,
    aoSelecionarElemento,
    aoBoundsAlterado
  ]);

  useEffect(() => {
    if (!containerRef.current || mapaRef.current) {
      return;
    }

    configurarTextosDesenho();
    const mapa = L.map(containerRef.current, {
      maxZoom: ZOOM_MAXIMO_MAPA,
      zoomControl: false,
      preferCanvas: true
    }).setView([-16.72, -43.86], 5);

    mapaRef.current = mapa;
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
      camada.on("click", () => propsRef.current.aoSelecionarElemento(id));
    }

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
      setCoordenadasCursor(
        `Lat ${formatarNumero(evento.latlng.lat, 5)}, Lng ${formatarNumero(evento.latlng.lng, 5)}`
      );
    });

    function notificarBounds() {
      propsRef.current.aoBoundsAlterado(converterBounds(mapa.getBounds()));
    }

    mapa.on("moveend zoomend", notificarBounds);
    notificarBounds();

    mapa.on("click", async (evento: L.LeafletMouseEvent) => {
      const popup = L.popup()
        .setLatLng(evento.latlng)
        .setContent('<div class="popup-tecnico"><strong>Consultando altitude...</strong></div>')
        .openOn(mapa);

      const resultado = await propsRef.current.aoConsultarCoordenada(evento.latlng.lat, evento.latlng.lng);
      if (resultado) {
        popup.setContent(montarPopup(resultado));
      } else {
        popup.setContent('<div class="popup-tecnico"><strong>Não foi possível consultar este ponto.</strong></div>');
      }
    });

    return () => {
      mapa.remove();
      mapaRef.current = null;
    };
  }, []);

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
    if (!mapa) {
      return;
    }

    if (!relevoRef.current) {
      relevoRef.current = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
        maxZoom: ZOOM_MAXIMO_MAPA,
        maxNativeZoom: ZOOM_NATIVO_OPENTOPOMAP,
        opacity: 0.36,
        attribution: "OpenTopoMap"
      });
    }

    if (camadasVisiveis.relevo) {
      relevoRef.current.addTo(mapa);
    } else {
      relevoRef.current.removeFrom(mapa);
    }
  }, [camadasVisiveis.relevo]);

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
          ? { color: "#5f452a", weight: 2, opacity: 0.9, interactive: true }
          : { color: "#8a6f4d", weight: 1, opacity: 0.65, interactive: true };
      },
      onEachFeature: (feature, camada) => {
        const elevacao = Number(feature.properties?.elevacao);
        camada.bindPopup(`
          <div class="popup-tecnico">
            <strong>Curva de nível: ${formatarMetros(elevacao, 0)}</strong>
            <dl>
              <dt>Fonte</dt><dd>RAW interpolado</dd>
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
      <div className="sobreposicao-mapa topo-esquerda">
        <strong>Mapa operacional</strong>
        <span>Interpolação bilinear sobre fonte global de baixa resolução</span>
      </div>
      <div className="sobreposicao-mapa cursor-mapa">{coordenadasCursor}</div>
    </section>
  );
}
