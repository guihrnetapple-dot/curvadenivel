import { obterSupabase, supabaseConfigurado } from "../lib/supabaseClient";

type MetadadosAuditoria = Record<string, unknown>;

interface EventoAuditoria {
  event_type: string;
  email?: string | null;
  metadata?: MetadadosAuditoria;
}

function obterUserAgentData() {
  const navegador = navigator as Navigator & {
    userAgentData?: {
      brands?: Array<{ brand: string; version: string }>;
      mobile?: boolean;
      platform?: string;
    };
  };

  return navegador.userAgentData ?? {};
}

function obterDadosNavegador(metadata: MetadadosAuditoria = {}) {
  return {
    path: `${window.location.pathname}${window.location.search}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    languages: navigator.languages,
    platform: navigator.platform,
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      colorDepth: window.screen.colorDepth,
      pixelDepth: window.screen.pixelDepth
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    },
    user_agent_data: obterUserAgentData(),
    metadata
  };
}

export async function registrarEventoAuditoria(evento: EventoAuditoria): Promise<void> {
  if (!supabaseConfigurado) return;

  try {
    const supabase = obterSupabase();
    await supabase.functions.invoke("audit-event", {
      body: {
        ...evento,
        ...obterDadosNavegador(evento.metadata)
      }
    });
  } catch (erro) {
    if (import.meta.env.DEV) {
      console.warn("Falha ao registrar evento de auditoria:", erro);
    }
  }
}

export function registrarEventoAuditoriaSemBloquear(evento: EventoAuditoria): void {
  void registrarEventoAuditoria(evento);
}
