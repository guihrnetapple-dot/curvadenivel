const CHAVE_LOGIN_PERSISTENTE = "auth.loginPersistenteNestaMaquina";
const CHAVE_EMAIL_LEMBRADO = "auth.emailLembradoNestaMaquina";

function obterLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loginPersistenteAtivo(): boolean {
  return obterLocalStorage()?.getItem(CHAVE_LOGIN_PERSISTENTE) === "true";
}

export function definirLoginPersistente(ativo: boolean) {
  const storage = obterLocalStorage();
  if (!storage) return;

  if (ativo) {
    storage.setItem(CHAVE_LOGIN_PERSISTENTE, "true");
    return;
  }

  storage.removeItem(CHAVE_LOGIN_PERSISTENTE);
}

export function limparPreferenciaLoginPersistente() {
  obterLocalStorage()?.removeItem(CHAVE_LOGIN_PERSISTENTE);
}

export function obterEmailLembrado(): string {
  return obterLocalStorage()?.getItem(CHAVE_EMAIL_LEMBRADO) ?? "";
}

export function salvarEmailLembrado(email: string) {
  const normalizado = email.trim().toLowerCase();
  if (!normalizado) return;
  obterLocalStorage()?.setItem(CHAVE_EMAIL_LEMBRADO, normalizado);
}

export function limparEmailLembrado() {
  obterLocalStorage()?.removeItem(CHAVE_EMAIL_LEMBRADO);
}
