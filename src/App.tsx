import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { GripVertical, PanelRightClose, PanelRightOpen } from "lucide-react";

import { BarraSuperior } from "./componentes/BarraSuperior";
import { CarregamentoInicial } from "./componentes/CarregamentoInicial";
import { useAuth } from "./context/AuthContext";
import { consultarAltitude, consultarPerfilElevacao, consultarStatusApi } from "./servicos/apiAltimetria";
import { gerarCurvasNivel, gerarCurvasNivelPorGeometria } from "./servicos/apiCurvasNivel";
import { pesquisarLocalizacao } from "./servicos/apiLocalizacao";
import { sair } from "./servicos/authService";
import type {
  AlertaSistema,
  BboxCurvasNivel,
  CamadaBase,
  CamadaImportada,
  CamadasVisiveis,
  CurvasNivelGeoJson,
  ElementoMapa,
  LocalizacaoEncontrada,
  MetricaPropriedade,
  PerfilElevacao,
  PontoPerfil,
  ResultadoAltitude,
  StatusApi,
  TemaVisual
} from "./tipos/altimetria";

const AccountSettingsPage = lazy(() =>
  import("./componentes/conta/AccountSettingsPage").then((modulo) => ({ default: modulo.AccountSettingsPage }))
);
const MapaAltimetria = lazy(() => import("./componentes/MapaAltimetria").then((modulo) => ({ default: modulo.MapaAltimetria })));
const PainelDireito = lazy(() => import("./componentes/PainelDireito").then((modulo) => ({ default: modulo.PainelDireito })));

const CHAVE_HISTORICO = "agroaltimetria.historico";
const TEMA_PADRAO: TemaVisual = "escuro";
const LARGURA_PAINEL_PADRAO = 350;
const LARGURA_PAINEL_MINIMA = 280;
const LARGURA_PAINEL_MAXIMA = 560;
const camadasIniciais: CamadasVisiveis = {
  gradeAltitude: true,
  importados: true,
  desenhos: true
};

interface FocoElementoMapa {
  id: string;
  versao: number;
}

function lerLocalStorage<T>(chave: string, fallback: T): T {
  try {
    const conteudo = localStorage.getItem(chave);
    return conteudo ? (JSON.parse(conteudo) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function Aplicacao() {
  const { usuario, perfil: perfilUsuario } = useAuth();
  const inputArquivoRef = useRef<HTMLInputElement | null>(null);
  const elementosRef = useRef<ElementoMapa[]>([]);
  const historicoElementosRef = useRef<ElementoMapa[][]>([]);
  const refazimentoElementosRef = useRef<ElementoMapa[][]>([]);
  const larguraInicialPainelRef = useRef(LARGURA_PAINEL_PADRAO);
  const xInicialRedimensionamentoRef = useRef(0);
  const tema = TEMA_PADRAO;
  const [, setStatusApi] = useState<StatusApi>({
    carregando: true,
    backendOnline: false
  });
  const [inicializando, setInicializando] = useState(true);
  const [camadaBase, setCamadaBase] = useState<CamadaBase>("satelite");
  const camadasVisiveis = camadasIniciais;
  const [historico, setHistorico] = useState<ResultadoAltitude[]>(() =>
    lerLocalStorage<ResultadoAltitude[]>(CHAVE_HISTORICO, [])
  );
  const [resultadoAtual, setResultadoAtual] = useState<ResultadoAltitude | null>(historico[0] ?? null);
  const [elementos, setElementos] = useState<ElementoMapa[]>([]);
  const [elementoSelecionadoId, setElementoSelecionadoId] = useState<string | null>(null);
  const [camadasImportadas, setCamadasImportadas] = useState<CamadaImportada[]>([]);
  const [perfil, setPerfil] = useState<PerfilElevacao | null>(null);
  const [carregandoPerfil, setCarregandoPerfil] = useState(false);
  const [curvasNivel, setCurvasNivel] = useState<CurvasNivelGeoJson | null>(null);
  const [visibilidadeCamadaCurvasNivel, setVisibilidadeCamadaCurvasNivel] = useState(true);
  const [carregandoCurvas, setCarregandoCurvas] = useState(false);
  const [, setBoundsMapa] = useState<BboxCurvasNivel | null>(null);
  const [selecionandoAreaCurvas, setSelecionandoAreaCurvas] = useState(false);
  const [selecionandoPontoAltitude, setSelecionandoPontoAltitude] = useState(false);
  const [intervaloCurvasMetros, setIntervaloCurvasMetros] = useState(5);
  const [pontoDestacado, setPontoDestacado] = useState<PontoPerfil | null>(null);
  const [termoLocalizacao, setTermoLocalizacao] = useState("");
  const [carregandoLocalizacao, setCarregandoLocalizacao] = useState(false);
  const [localizacaoFocada, setLocalizacaoFocada] = useState<LocalizacaoEncontrada | null>(null);
  const [elementoFocado, setElementoFocado] = useState<FocoElementoMapa | null>(null);
  const [rotulosMapaAtivos, setRotulosMapaAtivos] = useState(true);
  const [alerta, setAlerta] = useState<AlertaSistema | null>(null);
  const [rotaAplicacao, setRotaAplicacao] = useState(() => window.location.pathname);
  const [painelVisivel, setPainelVisivel] = useState(true);
  const [larguraPainel, setLarguraPainel] = useState(LARGURA_PAINEL_PADRAO);

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
  }, [tema]);

  useEffect(() => {
    function aoVoltar() {
      setRotaAplicacao(window.location.pathname);
      document.title = window.location.pathname === "/configuracoes/conta"
        ? "Configurações da conta | GeoCampo"
        : "Home | GeoCampo";
    }

    window.addEventListener("popstate", aoVoltar);
    aoVoltar();
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);

  function navegarAplicacao(caminho: string) {
    if (window.location.pathname !== caminho) {
      window.history.pushState(null, "", caminho);
    }
    if (caminho === "/confirmaremail") {
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }
    setRotaAplicacao(caminho);
    document.title = caminho === "/configuracoes/conta" ? "Configurações da conta | GeoCampo" : "Home | GeoCampo";
  }

  useEffect(() => {
    localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(historico.slice(0, 80)));
  }, [historico]);

  useEffect(() => {
    elementosRef.current = elementos;
  }, [elementos]);

  const verificarStatus = useCallback(async () => {
    try {
      const status = await consultarStatusApi();
      setStatusApi(status);
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Backend offline.";
      setStatusApi({
        carregando: false,
        backendOnline: false,
        erro: mensagem
      });
    }
  }, []);

  useEffect(() => {
    verificarStatus().finally(() => setInicializando(false));
    const intervalo = window.setInterval(verificarStatus, 12000);
    return () => window.clearInterval(intervalo);
  }, [verificarStatus]);

  useEffect(() => {
    if (!alerta) {
      return;
    }
    const temporizador = window.setTimeout(() => setAlerta(null), 5200);
    return () => window.clearTimeout(temporizador);
  }, [alerta]);

  useEffect(() => {
    const ajusteImediato = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
    const ajusteAposLayout = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 180);

    return () => {
      window.clearTimeout(ajusteImediato);
      window.clearTimeout(ajusteAposLayout);
    };
  }, [painelVisivel, larguraPainel]);

  const registrarResultado = useCallback((resultado: ResultadoAltitude) => {
    setResultadoAtual(resultado);
    setHistorico((itens) => [resultado, ...itens].slice(0, 80));
  }, []);

  const consultarCoordenada = useCallback(
    async (latitude: number, longitude: number): Promise<ResultadoAltitude | null> => {
      try {
        const resultado = await consultarAltitude(latitude, longitude);
        registrarResultado(resultado);
        setAlerta({
          tipo: resultado.status === "valido" ? "sucesso" : "aviso",
          mensagem: resultado.mensagem
        });
        return resultado;
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : "Não foi possível consultar a altitude.";
        setAlerta({ tipo: "erro", mensagem });
        return null;
      }
    },
    [registrarResultado]
  );

  function iniciarAnalisePonto() {
    setSelecionandoPontoAltitude(true);
    setSelecionandoAreaCurvas(false);
  }

  async function analisarPontoNoMapa(latitude: number, longitude: number) {
    setSelecionandoPontoAltitude(false);
    await consultarCoordenada(latitude, longitude);
  }

  function alterarElementosComHistorico(obterProximoEstado: (itens: ElementoMapa[]) => ElementoMapa[]) {
    setElementos((itens) => {
      const proximoEstado = obterProximoEstado(itens);
      historicoElementosRef.current = [...historicoElementosRef.current.slice(-79), itens];
      refazimentoElementosRef.current = [];
      return proximoEstado;
    });
  }

  function limparSelecaoElemento() {
    setElementoSelecionadoId(null);
  }

  function centralizarElementoNoMapa(id: string) {
    setElementoSelecionadoId(id);
    setElementoFocado((atual) => ({
      id,
      versao: (atual?.versao ?? 0) + 1
    }));
  }

  function desfazerElementos() {
    const estadoAnterior = historicoElementosRef.current[historicoElementosRef.current.length - 1];
    if (!estadoAnterior) {
      return;
    }

    historicoElementosRef.current = historicoElementosRef.current.slice(0, -1);
    refazimentoElementosRef.current = [...refazimentoElementosRef.current, elementosRef.current];
    setElementos(estadoAnterior);
    setElementoSelecionadoId(null);
    setPerfil(null);
    setPontoDestacado(null);
  }

  function refazerElementos() {
    const proximoEstado = refazimentoElementosRef.current[refazimentoElementosRef.current.length - 1];
    if (!proximoEstado) {
      return;
    }

    refazimentoElementosRef.current = refazimentoElementosRef.current.slice(0, -1);
    historicoElementosRef.current = [...historicoElementosRef.current, elementosRef.current];
    setElementos(proximoEstado);
    setElementoSelecionadoId(null);
    setPerfil(null);
    setPontoDestacado(null);
  }

  useEffect(() => {
    function aoPressionarAtalho(evento: KeyboardEvent) {
      const alvo = evento.target;
      const alvoEditavel =
        alvo instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName) || alvo.isContentEditable);

      if (alvoEditavel || !evento.ctrlKey || evento.altKey || evento.key.toLowerCase() !== "z") {
        return;
      }

      evento.preventDefault();
      if (evento.shiftKey) {
        refazerElementos();
      } else {
        desfazerElementos();
      }
    }

    window.addEventListener("keydown", aoPressionarAtalho);
    return () => window.removeEventListener("keydown", aoPressionarAtalho);
  }, []);

  function adicionarElemento(elemento: ElementoMapa) {
    alterarElementosComHistorico((itens) => [elemento, ...itens]);
  }

  function criarMarcadorTecnico(metrica: MetricaPropriedade, elementoOrigem: ElementoMapa) {
    if (!metrica.coordenada) {
      return;
    }

    const id = `marcador-tecnico-${elementoOrigem.id}-${metrica.chave}`;
    const horario = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    });
    const marcador: ElementoMapa = {
      id,
      nome: `${metrica.item} ${horario}`,
      tipo: "Marcador",
      origem: "desenho",
      geometria: {
        type: "Point",
        coordinates: [metrica.coordenada.longitude, metrica.coordenada.latitude]
      },
      ativo: true,
      cor: "#dc2626",
      criadoEm: new Date().toISOString()
    };

    alterarElementosComHistorico((itens) => {
      const existe = itens.some((item) => item.id === id);
      if (existe) {
        return itens.map((item) => (item.id === id ? marcador : item));
      }
      return [marcador, ...itens];
    });
    setElementoSelecionadoId(id);
    setAlerta({ tipo: "sucesso", mensagem: "Marcador técnico criado no mapa." });
  }

  function atualizarElemento(elementoAtualizado: ElementoMapa) {
    alterarElementosComHistorico((itens) =>
      itens.map((item) =>
        item.id === elementoAtualizado.id
          ? {
              ...item,
              tipo: elementoAtualizado.tipo,
              geometria: elementoAtualizado.geometria
            }
          : item
      )
    );
  }

  function removerElemento(id: string) {
    alterarElementosComHistorico((itens) => itens.filter((item) => item.id !== id));
    if (elementoSelecionadoId === id) {
      setElementoSelecionadoId(null);
      setPerfil(null);
    }
  }

  async function importarArquivos(arquivos: FileList | null) {
    if (!arquivos?.length) {
      return;
    }

    try {
      const { importarArquivoGeografico } = await import("./utilitarios/importacaoGeografica");
      const importadas = await Promise.all(Array.from(arquivos).map(importarArquivoGeografico));
      setCamadasImportadas((itens) => [...importadas, ...itens]);
      setAlerta({
        tipo: "sucesso",
        mensagem: `${importadas.length} camada(s) importada(s) com sucesso.`
      });
    } catch (erro) {
      setAlerta({
        tipo: "erro",
        mensagem: erro instanceof Error ? erro.message : "Falha ao importar arquivo geográfico."
      });
    } finally {
      if (inputArquivoRef.current) {
        inputArquivoRef.current.value = "";
      }
    }
  }

  function alternarCamadaImportada(id: string) {
    setCamadasImportadas((itens) =>
      itens.map((item) => (item.id === id ? { ...item, ativa: !item.ativa } : item))
    );
  }

  async function analisarPerfil() {
    const elemento = elementos.find((item) => item.id === elementoSelecionadoId);
    if (!elemento) {
      setAlerta({ tipo: "aviso", mensagem: "Selecione um elemento desenhado para analisar." });
      return;
    }

    setCarregandoPerfil(true);
    setPontoDestacado(null);
    try {
      const resultado = await consultarPerfilElevacao(elemento.geometria);
      setPerfil(resultado);
      setAlerta({
        tipo: "sucesso",
        mensagem: "Perfil de elevação calculado."
      });
    } catch (erro) {
      setAlerta({
        tipo: "erro",
        mensagem: erro instanceof Error ? erro.message : "Não foi possível calcular o perfil."
      });
    } finally {
      setCarregandoPerfil(false);
    }
  }

  function iniciarSelecaoAreaCurvas() {
    if (carregandoCurvas) {
      return;
    }

    setSelecionandoAreaCurvas(true);
    setAlerta({
      tipo: "aviso",
      mensagem: "Desenhe um retângulo no mapa para definir a área das curvas de nível."
    });
  }

  function obterElementoSelecionado(): ElementoMapa | null {
    return elementos.find((item) => item.id === elementoSelecionadoId) ?? null;
  }

  function elementoSelecionadoEhArea(): boolean {
    const elemento = obterElementoSelecionado();
    return elemento?.geometria.type === "Polygon" || elemento?.geometria.type === "Circle";
  }

  async function gerarCurvasDoRetanguloSelecionado(boundsSelecionado: BboxCurvasNivel) {
    setSelecionandoAreaCurvas(false);
    setCarregandoCurvas(true);
    try {
      const resultado = await gerarCurvasNivel(boundsSelecionado, intervaloCurvasMetros);
      setCurvasNivel(resultado);
      setVisibilidadeCamadaCurvasNivel(true);
      setAlerta({
        tipo: resultado.features.length > 0 ? "sucesso" : "aviso",
        mensagem:
          resultado.features.length > 0
            ? `${resultado.features.length} curva(s) de nível gerada(s) para a área selecionada.`
            : "Nenhuma curva de nível encontrada nessa área com os parâmetros atuais."
      });
    } catch (erro) {
      setAlerta({
        tipo: "erro",
        mensagem: erro instanceof Error ? erro.message : "Não foi possível gerar curvas de nível."
      });
    } finally {
      setCarregandoCurvas(false);
    }
  }

  async function gerarCurvasDaAreaSelecionada() {
    const elemento = obterElementoSelecionado();
    if (!elemento || (elemento.geometria.type !== "Polygon" && elemento.geometria.type !== "Circle")) {
      setAlerta({
        tipo: "aviso",
        mensagem: "Selecione um retângulo, círculo ou polígono para gerar curvas pela área selecionada."
      });
      return;
    }

    setSelecionandoAreaCurvas(false);
    setCarregandoCurvas(true);
    try {
      const resultado = await gerarCurvasNivelPorGeometria(elemento.geometria, intervaloCurvasMetros);
      setCurvasNivel(resultado);
      setVisibilidadeCamadaCurvasNivel(true);
      setAlerta({
        tipo: resultado.features.length > 0 ? "sucesso" : "aviso",
        mensagem:
          resultado.features.length > 0
            ? `${resultado.features.length} curva(s) de nível gerada(s) dentro de ${elemento.nome}.`
            : "Nenhuma curva de nível encontrada nessa área com os parâmetros atuais."
      });
    } catch (erro) {
      setAlerta({
        tipo: "erro",
        mensagem: erro instanceof Error ? erro.message : "Não foi possível gerar curvas de nível."
      });
    } finally {
      setCarregandoCurvas(false);
    }
  }

  async function executarExportacao(acao: () => void | Promise<void>) {
    try {
      await acao();
      setAlerta({ tipo: "sucesso", mensagem: "Exportação iniciada." });
    } catch (erro) {
      setAlerta({
        tipo: "erro",
        mensagem: erro instanceof Error ? erro.message : "Não foi possível exportar."
      });
    }
  }

  function limitarLarguraPainel(valor: number): number {
    return Math.min(LARGURA_PAINEL_MAXIMA, Math.max(LARGURA_PAINEL_MINIMA, valor));
  }

  function iniciarRedimensionamentoPainel(evento: ReactPointerEvent<HTMLButtonElement>) {
    evento.preventDefault();
    setPainelVisivel(true);
    larguraInicialPainelRef.current = larguraPainel;
    xInicialRedimensionamentoRef.current = evento.clientX;
    document.body.classList.add("redimensionando-painel");

    function aoMover(ponteiro: PointerEvent) {
      const deslocamento = ponteiro.clientX - xInicialRedimensionamentoRef.current;
      setLarguraPainel(limitarLarguraPainel(larguraInicialPainelRef.current - deslocamento));
    }

    function aoSoltar() {
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      document.body.classList.remove("redimensionando-painel");
    }

    window.addEventListener("pointermove", aoMover);
    window.addEventListener("pointerup", aoSoltar, { once: true });
  }

  async function buscarLocalizacao() {
    setCarregandoLocalizacao(true);
    try {
      const resultados = await pesquisarLocalizacao(termoLocalizacao);
      const primeira = resultados[0];
      if (!primeira) {
        setAlerta({ tipo: "aviso", mensagem: "Nenhuma localização encontrada." });
        return;
      }

      setLocalizacaoFocada(primeira);
      setAlerta({ tipo: "sucesso", mensagem: `Localização encontrada: ${primeira.nome}` });
    } catch (erro) {
      setAlerta({
        tipo: "erro",
        mensagem: erro instanceof Error ? erro.message : "Não foi possível pesquisar a localização."
      });
    } finally {
      setCarregandoLocalizacao(false);
    }
  }

  async function encerrarSessao() {
    try {
      await sair();
    } catch (erro) {
      setAlerta({
        tipo: "erro",
        mensagem: erro instanceof Error ? erro.message : "Não foi possível sair da conta."
      });
    }
  }

  return (
    <div className="aplicacao">
      {inicializando && <CarregamentoInicial />}

      <BarraSuperior
        nomeUsuario={perfilUsuario?.full_name}
        usuarioEmail={usuario?.email}
        aoIrInicio={() => navegarAplicacao("/home")}
        aoAbrirConfiguracoes={() => navegarAplicacao("/configuracoes/conta")}
        aoSair={encerrarSessao}
      />

      {rotaAplicacao === "/configuracoes/conta" ? (
        <Suspense fallback={<CarregamentoInicial />}>
          <AccountSettingsPage
            aoVoltar={() => navegarAplicacao("/home")}
            aoConfirmarEmail={() => navegarAplicacao("/confirmaremail")}
          />
        </Suspense>
      ) : (
        <>
      <main
        className={painelVisivel ? "area-trabalho" : "area-trabalho painel-lateral-oculto"}
        style={{ "--largura-painel": `${larguraPainel}px` } as CSSProperties}
      >
        <div className="coluna-mapa">
          <Suspense fallback={<CarregamentoInicial />}>
            <MapaAltimetria
              tema={tema}
              camadaBase={camadaBase}
              rotulosMapaAtivos={rotulosMapaAtivos}
              localizacaoFocada={localizacaoFocada}
              elementoFocado={elementoFocado}
              aoAlterarCamadaBase={setCamadaBase}
              camadasVisiveis={camadasVisiveis}
              elementos={elementos}
              camadasImportadas={camadasImportadas}
              curvasNivel={curvasNivel}
              visibilidadeCamadaCurvasNivel={visibilidadeCamadaCurvasNivel}
              pontoDestacado={pontoDestacado}
              elementoSelecionadoId={elementoSelecionadoId}
              selecaoAreaCurvasAtiva={selecionandoAreaCurvas}
              selecaoPontoAltitudeAtiva={selecionandoPontoAltitude}
              aoElementoCriado={adicionarElemento}
              aoElementoAtualizado={atualizarElemento}
              aoElementoRemovido={removerElemento}
              aoSelecionarElemento={setElementoSelecionadoId}
              aoLimparSelecao={limparSelecaoElemento}
              aoBoundsAlterado={setBoundsMapa}
              aoAreaCurvasSelecionada={gerarCurvasDoRetanguloSelecionado}
              aoCancelarSelecaoAreaCurvas={() => setSelecionandoAreaCurvas(false)}
              aoPontoAltitudeSelecionado={analisarPontoNoMapa}
              aoCancelarSelecaoPontoAltitude={() => setSelecionandoPontoAltitude(false)}
            />
          </Suspense>
        </div>

        {painelVisivel ? (
          <div className="painel-lateral">
            <button
              className="alca-redimensionar-painel"
              type="button"
              aria-label="Redimensionar barra lateral"
              title="Arraste para redimensionar"
              onPointerDown={iniciarRedimensionamentoPainel}
            >
              <GripVertical size={16} aria-hidden="true" />
            </button>
            <div className="controles-painel-lateral" aria-label="Controles da barra lateral">
              <button type="button" onClick={() => setPainelVisivel(false)} aria-label="Ocultar barra lateral" title="Ocultar">
                <PanelRightClose size={16} aria-hidden="true" />
              </button>
            </div>
            <Suspense fallback={<CarregamentoInicial />}>
              <PainelDireito
          elementos={elementos}
          elementoSelecionadoId={elementoSelecionadoId}
          curvasNivel={curvasNivel}
          visibilidadeCamadaCurvasNivel={visibilidadeCamadaCurvasNivel}
          carregandoCurvas={carregandoCurvas}
          selecionandoAreaCurvas={selecionandoAreaCurvas}
          termoLocalizacao={termoLocalizacao}
          carregandoLocalizacao={carregandoLocalizacao}
          rotulosMapaAtivos={rotulosMapaAtivos}
          intervaloCurvasMetros={intervaloCurvasMetros}
          camadasImportadas={camadasImportadas}
          areaSelecionadaParaCurvas={elementoSelecionadoEhArea() ? obterElementoSelecionado() : null}
          existeElementoSelecionado={Boolean(elementoSelecionadoId)}
          aoAlterarTermoLocalizacao={setTermoLocalizacao}
          aoPesquisarLocalizacao={buscarLocalizacao}
          aoAlternarRotulosMapa={() => setRotulosMapaAtivos((valor) => !valor)}
          aoSelecionarElemento={(id) => setElementoSelecionadoId(id || null)}
          aoCentralizarElemento={centralizarElementoNoMapa}
          aoAlterarIntervaloCurvas={setIntervaloCurvasMetros}
          aoGerarCurvas={iniciarSelecaoAreaCurvas}
          aoGerarCurvasAreaSelecionada={gerarCurvasDaAreaSelecionada}
          aoLimparCurvas={() => {
            setCurvasNivel(null);
            setSelecionandoAreaCurvas(false);
          }}
          aoImportarArquivo={() => inputArquivoRef.current?.click()}
          aoAlternarCamadaImportada={alternarCamadaImportada}
          aoAlternarCamadaCurvasNivel={() => setVisibilidadeCamadaCurvasNivel((valor) => !valor)}
          aoExportarRelatorio={() => executarExportacao(async () => {
            const { exportarRelatorioHtml } = await import("./utilitarios/exportacao");
            exportarRelatorioHtml(perfil);
          })}
          aoExportarCurvasKml={() => executarExportacao(async () => {
            const { exportarCurvasNivelKml } = await import("./utilitarios/exportacaoCurvasNivel");
            exportarCurvasNivelKml(curvasNivel);
          })}
          aoExportarCurvasKmz={() => executarExportacao(async () => {
            const { exportarCurvasNivelKmz } = await import("./utilitarios/exportacaoCurvasNivel");
            exportarCurvasNivelKmz(curvasNivel);
          })}
          aoExportarKml={() => executarExportacao(async () => {
            const { exportarDesenhosKml } = await import("./utilitarios/exportacao");
            exportarDesenhosKml(elementos);
          })}
          aoCriarMarcadorTecnico={criarMarcadorTecnico}
        />
            </Suspense>
          </div>
        ) : (
          <button
            className="botao-reexibir-painel"
            type="button"
            onClick={() => setPainelVisivel(true)}
            aria-label="Exibir barra lateral"
            title="Exibir barra lateral"
          >
            <PanelRightOpen size={18} aria-hidden="true" />
          </button>
        )}
      </main>
        </>
      )}

      <input
        ref={inputArquivoRef}
        className="entrada-arquivo"
        type="file"
        multiple
        accept=".kml,.kmz,.geojson,.json"
        onChange={(evento) => importarArquivos(evento.target.files)}
      />

      {alerta && <div className={`alerta-sistema ${alerta.tipo}`}>{alerta.mensagem}</div>}
    </div>
  );
}
