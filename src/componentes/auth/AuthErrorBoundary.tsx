import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  possuiErro: boolean;
  erro: Error | null;
  detalhes: string | null;
}

export class AuthErrorBoundary extends Component<Props, State> {
  state: State = { possuiErro: false, erro: null, detalhes: null };

  static getDerivedStateFromError(erro: Error): State {
    return { possuiErro: true, erro, detalhes: null };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    this.setState({ detalhes: info.componentStack ?? null });

    if (import.meta.env.DEV) {
      console.error("Falha ao carregar o aplicativo:", erro, info);
    }
  }

  render() {
    if (!this.state.possuiErro) {
      return this.props.children;
    }

    return (
      <main className="auth-pagina">
        <section className="auth-erro-aplicacao" role="alert">
          <strong>Erro ao carregar o aplicativo</strong>
          <span>Recarregue a página. Se o problema continuar, tente entrar novamente.</span>
          {import.meta.env.DEV && (
            <pre>
              {[this.state.erro?.message, this.state.erro?.stack, this.state.detalhes].filter(Boolean).join("\n\n")}
            </pre>
          )}
          <button type="button" onClick={() => window.location.reload()}>
            Recarregar
          </button>
        </section>
      </main>
    );
  }
}
