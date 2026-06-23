import JSZip from "jszip";

import type { CurvasNivelGeoJson, FeatureCurvaNivel, ParLngLat } from "../tipos/altimetria";

const PREFIXO_ARQUIVO_EXPORTACAO = "geocampo-itefagro";

const ESTILOS_CURVAS_NIVEL = {
  normal: {
    id: "curva-normal",
    corKml: "ff1673f9",
    largura: 2
  },
  mestra: {
    id: "curva-mestra",
    corKml: "ff2626dc",
    largura: 3
  }
} as const;

function validarCurvasNivel(curvasNivel: CurvasNivelGeoJson | null): CurvasNivelGeoJson {
  if (!curvasNivel || curvasNivel.features.length === 0) {
    throw new Error("Gere curvas de nível antes de exportar.");
  }

  return curvasNivel;
}

function escaparXml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function nomeArquivoExportacao(nomeArquivo: string): string {
  return nomeArquivo.startsWith(`${PREFIXO_ARQUIVO_EXPORTACAO}-`)
    ? nomeArquivo
    : `${PREFIXO_ARQUIVO_EXPORTACAO}-${nomeArquivo}`;
}

function baixarBlob(nomeArquivo: string, conteudo: BlobPart[], tipoMime: string): void {
  const blob = new Blob(conteudo, { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const ancora = document.createElement("a");
  ancora.href = url;
  ancora.download = nomeArquivoExportacao(nomeArquivo);
  document.body.appendChild(ancora);
  ancora.click();
  ancora.remove();
  URL.revokeObjectURL(url);
}

function formatarNumeroDxf(valor: number): string {
  return Number.isFinite(valor) ? Number(valor.toFixed(10)).toString() : "0";
}

function coordenadasKml(curva: FeatureCurvaNivel): string {
  const elevacao = curva.properties.elevacao;
  return curva.geometry.coordinates
    .map(([longitude, latitude]) => `${longitude},${latitude},${elevacao}`)
    .join(" ");
}

function criarPlacemarkKml(curva: FeatureCurvaNivel): string {
  const { elevacao, tipo, fonte, comprimentoMetros, fechada } = curva.properties;
  const estilo = tipo === "mestra" ? ESTILOS_CURVAS_NIVEL.mestra : ESTILOS_CURVAS_NIVEL.normal;
  return `
    <Placemark>
      <name>Curva ${escaparXml(elevacao)} m</name>
      <styleUrl>#${estilo.id}</styleUrl>
      <ExtendedData>
        <Data name="elevacao"><value>${escaparXml(elevacao)}</value></Data>
        <Data name="tipo"><value>${escaparXml(tipo)}</value></Data>
        <Data name="fonte"><value>${escaparXml(fonte)}</value></Data>
        <Data name="comprimentoMetros"><value>${escaparXml(comprimentoMetros ?? "")}</value></Data>
        <Data name="fechada"><value>${escaparXml(Boolean(fechada))}</value></Data>
      </ExtendedData>
      <LineString>
        <tessellate>1</tessellate>
        <altitudeMode>clampToGround</altitudeMode>
        <coordinates>${coordenadasKml(curva)}</coordinates>
      </LineString>
    </Placemark>`;
}

export function gerarCurvasNivelKml(curvasNivel: CurvasNivelGeoJson): string {
  const placemarks = curvasNivel.features.map(criarPlacemarkKml).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Curvas de nível</name>
    <description>Curvas de nível georreferenciadas em EPSG:4326.</description>
    <Style id="${ESTILOS_CURVAS_NIVEL.normal.id}">
      <LineStyle>
        <color>${ESTILOS_CURVAS_NIVEL.normal.corKml}</color>
        <width>${ESTILOS_CURVAS_NIVEL.normal.largura}</width>
      </LineStyle>
    </Style>
    <Style id="${ESTILOS_CURVAS_NIVEL.mestra.id}">
      <LineStyle>
        <color>${ESTILOS_CURVAS_NIVEL.mestra.corKml}</color>
        <width>${ESTILOS_CURVAS_NIVEL.mestra.largura}</width>
      </LineStyle>
    </Style>
    ${placemarks}
  </Document>
</kml>`;
}

export function exportarCurvasNivelKml(curvasNivel: CurvasNivelGeoJson | null): void {
  const curvas = validarCurvasNivel(curvasNivel);
  baixarBlob(
    "curvas-nivel.kml",
    [gerarCurvasNivelKml(curvas)],
    "application/vnd.google-earth.kml+xml;charset=utf-8"
  );
}

export async function exportarCurvasNivelKmz(curvasNivel: CurvasNivelGeoJson | null): Promise<void> {
  const curvas = validarCurvasNivel(curvasNivel);
  const zip = new JSZip();
  zip.file("doc.kml", gerarCurvasNivelKml(curvas));
  const conteudo = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  baixarBlob("curvas-nivel.kmz", [conteudo], "application/vnd.google-earth.kmz");
}

function adicionarParDxf(linhas: string[], codigo: number, valor: string | number): void {
  linhas.push(String(codigo), String(valor));
}

function pontoMedio(coordenadas: ParLngLat[]): ParLngLat | null {
  if (coordenadas.length === 0) {
    return null;
  }

  return coordenadas[Math.floor(coordenadas.length / 2)];
}

function criarEntidadePolylineDxf(linhas: string[], curva: FeatureCurvaNivel): void {
  const { elevacao, tipo, fechada } = curva.properties;
  const layer = tipo === "mestra" ? "CURVAS_MESTRA" : "CURVAS_NORMAL";

  adicionarParDxf(linhas, 0, "LWPOLYLINE");
  adicionarParDxf(linhas, 8, layer);
  adicionarParDxf(linhas, 90, curva.geometry.coordinates.length);
  adicionarParDxf(linhas, 70, fechada ? 1 : 0);
  adicionarParDxf(linhas, 38, formatarNumeroDxf(elevacao));

  for (const [longitude, latitude] of curva.geometry.coordinates) {
    adicionarParDxf(linhas, 10, formatarNumeroDxf(longitude));
    adicionarParDxf(linhas, 20, formatarNumeroDxf(latitude));
  }
}

function criarTextoAltitudeDxf(linhas: string[], curva: FeatureCurvaNivel): void {
  const medio = pontoMedio(curva.geometry.coordinates);
  if (!medio) {
    return;
  }

  adicionarParDxf(linhas, 0, "TEXT");
  adicionarParDxf(linhas, 8, "TEXTOS_ALTITUDE");
  adicionarParDxf(linhas, 10, formatarNumeroDxf(medio[0]));
  adicionarParDxf(linhas, 20, formatarNumeroDxf(medio[1]));
  adicionarParDxf(linhas, 30, formatarNumeroDxf(curva.properties.elevacao));
  adicionarParDxf(linhas, 40, "0.00012");
  adicionarParDxf(linhas, 1, `${curva.properties.elevacao} m`);
}

export function gerarCurvasNivelDxf(curvasNivel: CurvasNivelGeoJson): string {
  const linhas: string[] = [];

  adicionarParDxf(linhas, 0, "SECTION");
  adicionarParDxf(linhas, 2, "HEADER");
  adicionarParDxf(linhas, 999, "DXF exportado em coordenadas geográficas EPSG:4326, X=longitude, Y=latitude.");
  adicionarParDxf(linhas, 0, "ENDSEC");
  adicionarParDxf(linhas, 0, "SECTION");
  adicionarParDxf(linhas, 2, "TABLES");
  adicionarParDxf(linhas, 0, "TABLE");
  adicionarParDxf(linhas, 2, "LAYER");
  adicionarParDxf(linhas, 70, 3);

  for (const [nome, cor] of [
    ["CURVAS_NORMAL", 32],
    ["CURVAS_MESTRA", 30],
    ["TEXTOS_ALTITUDE", 7]
  ] as const) {
    adicionarParDxf(linhas, 0, "LAYER");
    adicionarParDxf(linhas, 2, nome);
    adicionarParDxf(linhas, 70, 0);
    adicionarParDxf(linhas, 62, cor);
    adicionarParDxf(linhas, 6, "CONTINUOUS");
  }

  adicionarParDxf(linhas, 0, "ENDTAB");
  adicionarParDxf(linhas, 0, "ENDSEC");
  adicionarParDxf(linhas, 0, "SECTION");
  adicionarParDxf(linhas, 2, "ENTITIES");

  for (const curva of curvasNivel.features) {
    criarEntidadePolylineDxf(linhas, curva);
  }

  for (const curva of curvasNivel.features.filter((item) => item.properties.tipo === "mestra")) {
    criarTextoAltitudeDxf(linhas, curva);
  }

  adicionarParDxf(linhas, 0, "ENDSEC");
  adicionarParDxf(linhas, 0, "EOF");

  return linhas.join("\n");
}

export function exportarCurvasNivelDxf(curvasNivel: CurvasNivelGeoJson | null): void {
  const curvas = validarCurvasNivel(curvasNivel);
  baixarBlob("curvas-nivel.dxf", [gerarCurvasNivelDxf(curvas)], "application/dxf;charset=utf-8");
}
