import type { LocalizacaoEncontrada } from "../tipos/altimetria";

interface RespostaNominatim {
  display_name?: string;
  lat?: string;
  lon?: string;
  boundingbox?: [string, string, string, string];
}

function converterResultado(item: RespostaNominatim): LocalizacaoEncontrada | null {
  const latitude = Number(item.lat);
  const longitude = Number(item.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const bbox = item.boundingbox;
  return {
    nome: item.display_name ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    latitude,
    longitude,
    bbox: bbox
      ? {
          minLat: Number(bbox[0]),
          maxLat: Number(bbox[1]),
          minLng: Number(bbox[2]),
          maxLng: Number(bbox[3])
        }
      : undefined
  };
}

export async function pesquisarLocalizacao(termo: string): Promise<LocalizacaoEncontrada[]> {
  const consulta = termo.trim();
  if (consulta.length < 2) {
    throw new Error("Digite uma cidade, estado, país ou localização.");
  }

  const parametros = new URLSearchParams({
    format: "jsonv2",
    q: consulta,
    limit: "5",
    addressdetails: "1"
  });

  const resposta = await fetch(`https://nominatim.openstreetmap.org/search?${parametros.toString()}`, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!resposta.ok) {
    throw new Error("Não foi possível pesquisar essa localização.");
  }

  const corpo = (await resposta.json().catch(() => [])) as RespostaNominatim[];
  return corpo.map(converterResultado).filter((item): item is LocalizacaoEncontrada => item !== null);
}
