import type { CamadaImportada, CurvasNivelGeoJson, ElementoMapa, GeoJsonFeature, PerfilElevacao } from "../tipos/altimetria";
import { formatarNumero } from "./formatacao";

function baixarArquivo(nomeArquivo: string, conteudo: string, tipoMime: string): void {
  const blob = new Blob([conteudo], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const ancora = document.createElement("a");
  ancora.href = url;
  ancora.download = nomeArquivo;
  document.body.appendChild(ancora);
  ancora.click();
  ancora.remove();
  URL.revokeObjectURL(url);
}

function limparNomeArquivo(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function limparTextoXml(texto: string): string {
  const entidades: Record<string, string> = {
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;"
  };
  return texto.replace(/[<>&'"]/g, (caractere) => entidades[caractere] ?? "");
}

function converterElementoParaFeature(elemento: ElementoMapa): GeoJsonFeature {
  return {
    type: "Feature",
    properties: {
      nome: elemento.nome,
      tipo: elemento.tipo,
      origem: elemento.origem,
      cor: elemento.cor,
      criadoEm: elemento.criadoEm,
      raioMetros: elemento.geometria.type === "Circle" ? elemento.geometria.radiusMeters : undefined
    },
    geometry:
      elemento.geometria.type === "Circle"
        ? { type: "Point", coordinates: elemento.geometria.center }
        : elemento.geometria
  };
}

export function exportarPerfilCsv(perfil: PerfilElevacao | null): void {
  if (!perfil) {
    throw new Error("Calcule um perfil de elevação antes de exportar CSV.");
  }

  const cabecalho = "distancia_m,latitude,longitude,altitude_m,status,fonte,metodo";
  const linhas = perfil.pontos.map((ponto) =>
    [
      ponto.distanciaMetros.toFixed(2),
      ponto.latitude.toFixed(6),
      ponto.longitude.toFixed(6),
      ponto.altitude ?? "",
      ponto.status,
      ponto.fonte,
      ponto.metodo
    ].join(",")
  );

  baixarArquivo("perfil-elevacao.csv", [cabecalho, ...linhas].join("\n"), "text/csv;charset=utf-8");
}

export function exportarDesenhosGeoJson(elementos: ElementoMapa[], camadas: CamadaImportada[]): void {
  const features = [
    ...elementos.map(converterElementoParaFeature),
    ...camadas.flatMap((camada) => camada.geojson.features)
  ];

  baixarArquivo(
    "projeto-agroaltimetria.geojson",
    JSON.stringify({ type: "FeatureCollection", features }, null, 2),
    "application/geo+json;charset=utf-8"
  );
}

export function exportarElementoGeoJson(elemento: ElementoMapa | null): void {
  if (!elemento) {
    throw new Error("Selecione um elemento para exportar.");
  }

  baixarArquivo(
    `${limparNomeArquivo(elemento.nome) || "elemento"}.geojson`,
    JSON.stringify({ type: "FeatureCollection", features: [converterElementoParaFeature(elemento)] }, null, 2),
    "application/geo+json;charset=utf-8"
  );
}

export function exportarCurvasNivelGeoJson(curvasNivel: CurvasNivelGeoJson | null): void {
  if (!curvasNivel || curvasNivel.features.length === 0) {
    throw new Error("Gere curvas de nível antes de exportar GeoJSON.");
  }

  baixarArquivo("curvas-nivel.geojson", JSON.stringify(curvasNivel, null, 2), "application/geo+json;charset=utf-8");
}

function coordenadasParaKml(coordenadas: number[][]): string {
  return coordenadas.map(([longitude, latitude]) => `${longitude},${latitude},0`).join(" ");
}

function converterElementoParaPlacemark(elemento: ElementoMapa): string {
  const nome = limparTextoXml(elemento.nome);

  if (elemento.geometria.type === "Point") {
    return `<Placemark><name>${nome}</name><Point><coordinates>${coordenadasParaKml([
      elemento.geometria.coordinates
    ])}</coordinates></Point></Placemark>`;
  }

  if (elemento.geometria.type === "LineString") {
    return `<Placemark><name>${nome}</name><LineString><coordinates>${coordenadasParaKml(
      elemento.geometria.coordinates
    )}</coordinates></LineString></Placemark>`;
  }

  if (elemento.geometria.type === "Polygon") {
    return `<Placemark><name>${nome}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${coordenadasParaKml(
      elemento.geometria.coordinates[0] ?? []
    )}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
  }

  return `<Placemark><name>${nome}</name><Point><coordinates>${coordenadasParaKml([
    elemento.geometria.center
  ])}</coordinates></Point><ExtendedData><Data name="raio_m"><value>${formatarNumero(
    elemento.geometria.radiusMeters,
    2
  )}</value></Data></ExtendedData></Placemark>`;
}

function montarKml(placemarks: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks}</Document></kml>`;
}

export function exportarDesenhosKml(elementos: ElementoMapa[]): void {
  if (elementos.length === 0) {
    throw new Error("Não há desenhos para exportar em KML.");
  }

  baixarArquivo(
    "desenhos-agroaltimetria.kml",
    montarKml(elementos.map(converterElementoParaPlacemark).join("")),
    "application/vnd.google-earth.kml+xml;charset=utf-8"
  );
}

export function exportarElementoKml(elemento: ElementoMapa | null): void {
  if (!elemento) {
    throw new Error("Selecione um elemento para exportar.");
  }

  baixarArquivo(
    `${limparNomeArquivo(elemento.nome) || "elemento"}.kml`,
    montarKml(converterElementoParaPlacemark(elemento)),
    "application/vnd.google-earth.kml+xml;charset=utf-8"
  );
}

export function exportarRelatorioHtml(perfil: PerfilElevacao | null): void {
  const estatisticas = perfil?.estatisticas;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório GeoCampo</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#1d2b27}table{border-collapse:collapse;width:100%;margin-top:20px}td,th{border:1px solid #d7dfd9;padding:8px;text-align:left}h1{font-size:24px}</style></head><body><h1>Relatório GeoCampo</h1><p>Gerado em ${new Date().toLocaleString(
    "pt-BR"
  )}</p><table><tbody><tr><th>Altitude mínima</th><td>${formatarNumero(
    estatisticas?.altitudeMinima,
    0
  )} m</td></tr><tr><th>Altitude máxima</th><td>${formatarNumero(
    estatisticas?.altitudeMaxima,
    0
  )} m</td></tr><tr><th>Altitude média</th><td>${formatarNumero(
    estatisticas?.altitudeMedia,
    0
  )} m</td></tr><tr><th>Pontos amostrados</th><td>${estatisticas?.quantidadePontos ?? 0}</td></tr></tbody></table></body></html>`;

  const janela = window.open("", "_blank", "width=960,height=720");
  if (!janela) {
    throw new Error("O navegador bloqueou a janela do relatório.");
  }
  janela.document.write(html);
  janela.document.close();
  janela.focus();
  janela.print();
}
