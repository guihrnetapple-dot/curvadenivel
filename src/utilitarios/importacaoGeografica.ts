import JSZip from "jszip";

import type {
  CamadaImportada,
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  GeometriaLinha,
  GeometriaPoligono,
  GeometriaPonto,
  ParLngLat
} from "../tipos/altimetria";
import { gerarIdentificador } from "./formatacao";

type GeometriaGeoJson = GeometriaPonto | GeometriaLinha | GeometriaPoligono;

function normalizarFeatureCollection(conteudo: unknown): GeoJsonFeatureCollection {
  const registro = conteudo as Record<string, unknown>;
  if (registro.type === "FeatureCollection" && Array.isArray(registro.features)) {
    return registro as unknown as GeoJsonFeatureCollection;
  }
  if (registro.type === "Feature") {
    return { type: "FeatureCollection", features: [registro as unknown as GeoJsonFeature] };
  }
  if (typeof registro.type === "string" && "coordinates" in registro) {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: registro as unknown as GeometriaGeoJson
        }
      ]
    };
  }

  throw new Error("O GeoJSON informado não possui geometria válida.");
}

function lerSequenciaCoordenadas(texto: string): ParLngLat[] {
  return texto
    .trim()
    .split(/\s+/)
    .map((item) => {
      const [longitude, latitude] = item.split(",").map(Number);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error("O KML possui coordenadas inválidas.");
      }
      return [longitude, latitude] as ParLngLat;
    });
}

function lerTextoDoPrimeiroElemento(elemento: Element, seletor: string): string | null {
  return elemento.querySelector(seletor)?.textContent?.trim() ?? null;
}

function converterKmlParaGeoJson(textoKml: string): GeoJsonFeatureCollection {
  const documento = new DOMParser().parseFromString(textoKml, "application/xml");
  const erroParser = documento.querySelector("parsererror");
  if (erroParser) {
    throw new Error("O arquivo KML não pôde ser interpretado.");
  }

  const placemarks = Array.from(documento.getElementsByTagName("Placemark"));
  const features: GeoJsonFeature[] = [];

  for (const placemark of placemarks) {
    const nome = lerTextoDoPrimeiroElemento(placemark, "name") ?? "Elemento KML";
    const propriedades = { nome };
    const pontoTexto = lerTextoDoPrimeiroElemento(placemark, "Point coordinates");
    const linhaTexto = lerTextoDoPrimeiroElemento(placemark, "LineString coordinates");
    const poligonoTexto = lerTextoDoPrimeiroElemento(placemark, "Polygon outerBoundaryIs LinearRing coordinates");

    if (pontoTexto) {
      const coordenadas = lerSequenciaCoordenadas(pontoTexto);
      if (coordenadas[0]) {
        features.push({
          type: "Feature",
          properties: propriedades,
          geometry: { type: "Point", coordinates: coordenadas[0] }
        });
      }
    } else if (linhaTexto) {
      const coordenadas = lerSequenciaCoordenadas(linhaTexto);
      features.push({
        type: "Feature",
        properties: propriedades,
        geometry: { type: "LineString", coordinates: coordenadas }
      });
    } else if (poligonoTexto) {
      const coordenadas = lerSequenciaCoordenadas(poligonoTexto);
      features.push({
        type: "Feature",
        properties: propriedades,
        geometry: { type: "Polygon", coordinates: [coordenadas] }
      });
    }
  }

  if (features.length === 0) {
    throw new Error("Nenhum ponto, linha ou polígono foi encontrado no KML.");
  }

  return { type: "FeatureCollection", features };
}

async function lerTextoKmz(arquivo: File): Promise<string> {
  const zip = await JSZip.loadAsync(await arquivo.arrayBuffer());
  const entradaKml = Object.values(zip.files).find((entrada) => entrada.name.toLowerCase().endsWith(".kml"));
  if (!entradaKml) {
    throw new Error("O KMZ não contém um arquivo KML.");
  }
  return entradaKml.async("text");
}

export async function importarArquivoGeografico(arquivo: File): Promise<CamadaImportada> {
  const nomeMinusculo = arquivo.name.toLowerCase();
  let geojson: GeoJsonFeatureCollection;

  if (nomeMinusculo.endsWith(".geojson") || nomeMinusculo.endsWith(".json")) {
    geojson = normalizarFeatureCollection(JSON.parse(await arquivo.text()));
  } else if (nomeMinusculo.endsWith(".kml")) {
    geojson = converterKmlParaGeoJson(await arquivo.text());
  } else if (nomeMinusculo.endsWith(".kmz")) {
    geojson = converterKmlParaGeoJson(await lerTextoKmz(arquivo));
  } else {
    throw new Error("Formato não suportado. Use KML, KMZ ou GeoJSON.");
  }

  return {
    id: gerarIdentificador("camada"),
    nome: arquivo.name,
    tipoArquivo: arquivo.name.split(".").pop()?.toUpperCase() ?? "ARQUIVO",
    ativa: true,
    quantidadeElementos: geojson.features.length,
    geojson,
    importadaEm: new Date().toISOString()
  };
}
