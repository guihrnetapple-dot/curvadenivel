import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import type { PerfilElevacao, PontoPerfil } from "../tipos/altimetria";
import { formatarMetros, formatarNumero } from "../utilitarios/formatacao";

interface PropriedadesGraficoPerfil {
  perfil: PerfilElevacao | null;
  carregando: boolean;
  aoSelecionarPonto: (ponto: PontoPerfil) => void;
}

function TooltipPerfil({
  active,
  payload
}: {
  active?: boolean;
  payload?: Array<{ payload: PontoPerfil }>;
}) {
  if (!active || !payload?.[0]) {
    return null;
  }

  const ponto = payload[0].payload;
  return (
    <div className="tooltip-grafico">
      <strong>{formatarMetros(ponto.altitude, 0)}</strong>
      <span>Distância: {formatarNumero(ponto.distanciaMetros / 1000, 2)} km</span>
      <span>Lat: {formatarNumero(ponto.latitude, 5)}</span>
      <span>Lng: {formatarNumero(ponto.longitude, 5)}</span>
    </div>
  );
}

export function GraficoPerfil({ perfil, carregando, aoSelecionarPonto }: PropriedadesGraficoPerfil) {
  if (carregando) {
    return (
      <section className="grafico-perfil painel-baixo">
        <div className="cabecalho-painel-baixo">
          <strong>Perfil de elevação</strong>
          <span>Amostrando pontos no backend</span>
        </div>
        <div className="skeleton-grafico" />
      </section>
    );
  }

  if (!perfil) {
    return (
      <section className="grafico-perfil painel-baixo">
        <div className="cabecalho-painel-baixo">
          <strong>Perfil de elevação</strong>
          <span>Nenhum elemento analisado</span>
        </div>
        <div className="estado-vazio grafico-vazio">Selecione um desenho e execute a análise.</div>
      </section>
    );
  }

  return (
    <section className="grafico-perfil painel-baixo">
      <div className="cabecalho-painel-baixo">
        <strong>Perfil de elevação</strong>
        <span>
          {perfil.estatisticas.quantidadePontos} pontos, {formatarNumero(perfil.estatisticas.pontosSemDado, 0)} sem dado
        </span>
      </div>
      <ResponsiveContainer width="100%" height={190}>
        <AreaChart
          data={perfil.pontos}
          margin={{ top: 14, right: 16, bottom: 4, left: 0 }}
          onClick={(evento) => {
            const ponto = evento?.activePayload?.[0]?.payload as PontoPerfil | undefined;
            if (ponto) {
              aoSelecionarPonto(ponto);
            }
          }}
        >
          <defs>
            <linearGradient id="altitudePerfil" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2f6f4e" stopOpacity={0.34} />
              <stop offset="100%" stopColor="#2f6f4e" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey="distanciaMetros"
            tickFormatter={(valor) => `${formatarNumero(Number(valor) / 1000, 1)} km`}
            minTickGap={24}
          />
          <YAxis tickFormatter={(valor) => `${formatarNumero(Number(valor), 0)} m`} width={54} />
          <Tooltip content={<TooltipPerfil />} />
          <Area
            type="monotone"
            dataKey="altitude"
            stroke="#2f6f4e"
            strokeWidth={2}
            fill="url(#altitudePerfil)"
            connectNulls={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#ffffff" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
