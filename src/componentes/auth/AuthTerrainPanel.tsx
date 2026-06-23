import { useEffect, useRef } from "react";

function desenharCurva(
  contexto: CanvasRenderingContext2D,
  largura: number,
  altura: number,
  deslocamento: number,
  indice: number
) {
  const amplitude = 18 + indice * 6;
  const base = altura * (0.34 + indice * 0.11);
  const passo = largura / 9;

  contexto.beginPath();
  for (let x = -passo; x <= largura + passo; x += 10) {
    const ondaPrincipal = Math.sin((x + deslocamento * (0.8 + indice * 0.15)) / (46 + indice * 7));
    const ondaSecundaria = Math.cos((x - deslocamento * 0.45) / (82 + indice * 9));
    const y = base + ondaPrincipal * amplitude + ondaSecundaria * amplitude * 0.42;
    if (x === -passo) {
      contexto.moveTo(x, y);
    } else {
      contexto.lineTo(x, y);
    }
  }

  contexto.strokeStyle = `rgba(143, 216, 178, ${0.52 - indice * 0.055})`;
  contexto.lineWidth = indice % 3 === 0 ? 1.35 : 0.85;
  contexto.stroke();
}

export function AuthTerrainPanel() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const contexto = canvas.getContext("2d");
    if (!contexto) return;

    const elementoCanvas = canvas;
    const contexto2d = contexto;

    let quadro = 0;
    let animacao = 0;

    function redimensionar() {
      const proporcao = window.devicePixelRatio || 1;
      const caixa = elementoCanvas.getBoundingClientRect();
      elementoCanvas.width = Math.max(1, Math.floor(caixa.width * proporcao));
      elementoCanvas.height = Math.max(1, Math.floor(caixa.height * proporcao));
      contexto2d.setTransform(proporcao, 0, 0, proporcao, 0, 0);
    }

    function desenhar() {
      const largura = elementoCanvas.clientWidth;
      const altura = elementoCanvas.clientHeight;
      contexto2d.clearRect(0, 0, largura, altura);

      const gradiente = contexto2d.createLinearGradient(0, 0, largura, altura);
      gradiente.addColorStop(0, "rgba(47, 159, 117, 0.18)");
      gradiente.addColorStop(0.52, "rgba(106, 166, 184, 0.09)");
      gradiente.addColorStop(1, "rgba(12, 17, 23, 0)");
      contexto2d.fillStyle = gradiente;
      contexto2d.fillRect(0, 0, largura, altura);

      for (let indice = 0; indice < 13; indice += 1) {
        desenharCurva(contexto2d, largura, altura, quadro, indice);
      }

      contexto2d.fillStyle = "rgba(143, 216, 178, 0.88)";
      for (let i = 0; i < 18; i += 1) {
        const x = ((i * 73 + quadro * 0.18) % (largura + 80)) - 40;
        const y = altura * 0.24 + Math.sin(i * 1.7 + quadro / 82) * 18 + (i % 5) * 28;
        contexto2d.beginPath();
        contexto2d.arc(x, y, i % 4 === 0 ? 2.2 : 1.4, 0, Math.PI * 2);
        contexto2d.fill();
      }

      quadro += 0.62;
      animacao = requestAnimationFrame(desenhar);
    }

    redimensionar();
    desenhar();
    window.addEventListener("resize", redimensionar);

    return () => {
      cancelAnimationFrame(animacao);
      window.removeEventListener("resize", redimensionar);
    };
  }, []);

  return (
    <aside className="auth-terreno" aria-label="Visualização animada de terreno">
      <canvas ref={canvasRef} aria-hidden="true" />
    </aside>
  );
}
