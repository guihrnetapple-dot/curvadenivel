export function formatarNumero(valor: number | null | undefined, casas = 0): string {
  if (!Number.isFinite(valor)) {
    return "-";
  }

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  }).format(Number(valor));
}

export function formatarMetros(valor: number | null | undefined, casas = 0): string {
  if (!Number.isFinite(valor)) {
    return "-";
  }
  return `${formatarNumero(Number(valor), casas)} m`;
}

export function formatarArea(valor: number | null | undefined): string {
  if (!Number.isFinite(valor)) {
    return "-";
  }

  const area = Number(valor);
  if (area >= 1_000_000) {
    return `${formatarNumero(area / 1_000_000, 2)} km²`;
  }
  return `${formatarNumero(area, 0)} m²`;
}

export function formatarDataHoraIso(valor: string): string {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(data);
}

export function gerarIdentificador(prefixo: string): string {
  return `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
