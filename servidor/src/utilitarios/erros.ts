export class ErroAplicacao extends Error {
  public readonly statusHttp: number;
  public readonly detalhes?: unknown;

  constructor(mensagem: string, statusHttp = 400, detalhes?: unknown) {
    super(mensagem);
    this.name = "ErroAplicacao";
    this.statusHttp = statusHttp;
    this.detalhes = detalhes;
  }
}
