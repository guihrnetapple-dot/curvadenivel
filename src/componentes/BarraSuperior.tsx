import logoCurvaNivel from "../assets/logo-curva-nivel.png";

export function BarraSuperior() {
  return (
    <header className="barra-superior">
      <div className="marca">
        <div className="marca-simbolo">
          <img src={logoCurvaNivel} alt="Logo Curva de Nível" />
        </div>
        <div>
          <strong>Curva de Nível</strong>
          <span>Topografia, irrigação e Engenharia.</span>
        </div>
      </div>
    </header>
  );
}
