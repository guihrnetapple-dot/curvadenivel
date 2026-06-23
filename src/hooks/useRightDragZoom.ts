import L from "leaflet";
import { useEffect, useRef, type RefObject } from "react";

interface EstadoArrasteZoomDireito {
  ativo: boolean;
  iniciouArraste: boolean;
  yInicial: number;
  yAnterior: number;
  acumuladoZoom: number;
  quadroAnimacao: number | null;
  panAtivoAntes: boolean;
}

const BOTAO_DIREITO_MOUSE = 2;
const MOVIMENTO_MINIMO_PIXELS = 4;
const PIXELS_POR_NIVEL_ZOOM = 180;
const PASSO_MAXIMO_ZOOM = 0.12;
const ZOOM_SNAP_SUAVE = 0.05;

function ferramentaDesenhoAtiva(): boolean {
  return Boolean(document.querySelector(".leaflet-draw-toolbar-button-enabled"));
}

function alvoControleMapa(alvo: EventTarget | null): boolean {
  return alvo instanceof HTMLElement && Boolean(alvo.closest(".leaflet-control, .leaflet-draw-toolbar, .leaflet-editing-icon"));
}

function limitarZoom(mapa: L.Map, zoom: number): number {
  const zoomMinimo = mapa.getMinZoom();
  const zoomMaximo = mapa.getMaxZoom();
  return Math.min(zoomMaximo, Math.max(zoomMinimo, zoom));
}

export function useRightDragZoom(mapaRef: RefObject<L.Map | null>, ativo = true) {
  const estadoRef = useRef<EstadoArrasteZoomDireito>({
    ativo: false,
    iniciouArraste: false,
    yInicial: 0,
    yAnterior: 0,
    acumuladoZoom: 0,
    quadroAnimacao: null,
    panAtivoAntes: true
  });

  useEffect(() => {
    const mapaAtualPossivel = mapaRef.current;
    if (!ativo || mapaAtualPossivel === null) {
      return;
    }

    const mapaAtual: L.Map = mapaAtualPossivel;
    const container = mapaAtual.getContainer();
    const zoomSnapOriginal = mapaAtual.options.zoomSnap;

    function cancelarAnimacao() {
      const estado = estadoRef.current;
      if (estado.quadroAnimacao !== null) {
        window.cancelAnimationFrame(estado.quadroAnimacao);
        estado.quadroAnimacao = null;
      }
    }

    function pararArraste() {
      const estado = estadoRef.current;
      if (!estado.ativo) {
        return;
      }

      cancelarAnimacao();
      estado.ativo = false;
      estado.iniciouArraste = false;
      estado.acumuladoZoom = 0;
      if (estado.panAtivoAntes) {
        mapaAtual.dragging.enable();
      } else {
        mapaAtual.dragging.disable();
      }
      mapaAtual.options.zoomSnap = zoomSnapOriginal;
      container.classList.remove("modo-zoom-botao-direito");
    }

    function aplicarZoomSuave() {
      const estado = estadoRef.current;
      estado.quadroAnimacao = null;

      if (!estado.ativo || !estado.iniciouArraste || Math.abs(estado.acumuladoZoom) < 0.001) {
        return;
      }

      const passo = Math.max(-PASSO_MAXIMO_ZOOM, Math.min(PASSO_MAXIMO_ZOOM, estado.acumuladoZoom));
      estado.acumuladoZoom -= passo;
      mapaAtual.setZoomAround(mapaAtual.getCenter(), limitarZoom(mapaAtual, mapaAtual.getZoom() + passo), { animate: false });

      if (Math.abs(estado.acumuladoZoom) >= 0.001) {
        estado.quadroAnimacao = window.requestAnimationFrame(aplicarZoomSuave);
      }
    }

    function agendarZoom() {
      const estado = estadoRef.current;
      if (estado.quadroAnimacao === null) {
        estado.quadroAnimacao = window.requestAnimationFrame(aplicarZoomSuave);
      }
    }

    function aoMouseDown(evento: MouseEvent) {
      if (
        evento.button !== BOTAO_DIREITO_MOUSE ||
        ferramentaDesenhoAtiva() ||
        alvoControleMapa(evento.target)
      ) {
        return;
      }

      evento.preventDefault();
      evento.stopPropagation();
      const panAtivoAntes = mapaAtual.dragging.enabled();
      mapaAtual.options.zoomSnap = Math.min(zoomSnapOriginal || ZOOM_SNAP_SUAVE, ZOOM_SNAP_SUAVE);
      mapaAtual.dragging.disable();
      container.classList.add("modo-zoom-botao-direito");

      estadoRef.current = {
        ativo: true,
        iniciouArraste: false,
        yInicial: evento.clientY,
        yAnterior: evento.clientY,
        acumuladoZoom: 0,
        quadroAnimacao: null,
        panAtivoAntes
      };
    }

    function aoMouseMove(evento: MouseEvent) {
      const estado = estadoRef.current;
      if (!estado.ativo || (evento.buttons & 2) !== 2) {
        pararArraste();
        return;
      }

      evento.preventDefault();
      evento.stopPropagation();

      const deslocamentoTotal = evento.clientY - estado.yInicial;
      const deltaY = evento.clientY - estado.yAnterior;
      estado.yAnterior = evento.clientY;

      if (!estado.iniciouArraste && Math.abs(deslocamentoTotal) < MOVIMENTO_MINIMO_PIXELS) {
        return;
      }

      estado.iniciouArraste = true;
      estado.acumuladoZoom += deltaY / PIXELS_POR_NIVEL_ZOOM;
      agendarZoom();
    }

    function aoMouseUp(evento: MouseEvent) {
      if (evento.button === BOTAO_DIREITO_MOUSE) {
        evento.preventDefault();
        evento.stopPropagation();
        pararArraste();
      }
    }

    function aoContextMenu(evento: MouseEvent) {
      evento.preventDefault();
    }

    container.addEventListener("mousedown", aoMouseDown, true);
    container.addEventListener("contextmenu", aoContextMenu, true);
    window.addEventListener("mousemove", aoMouseMove, true);
    window.addEventListener("mouseup", aoMouseUp, true);
    window.addEventListener("blur", pararArraste);

    return () => {
      pararArraste();
      container.removeEventListener("mousedown", aoMouseDown, true);
      container.removeEventListener("contextmenu", aoContextMenu, true);
      window.removeEventListener("mousemove", aoMouseMove, true);
      window.removeEventListener("mouseup", aoMouseUp, true);
      window.removeEventListener("blur", pararArraste);
    };
  }, [ativo, mapaRef]);
}
