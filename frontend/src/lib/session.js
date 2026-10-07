import { createContext, createElement, useCallback, useContext, useEffect, useState } from "react";

const BASE = process.env.REACT_APP_BACKEND_URL;
// Without a configured API the site runs as the public, browser-local demo.
export const serverMode = Boolean(BASE);
// Deliberately outside the "law-suite-" prefix so recovery exports never include it.
const TOKEN_KEY = "lawsuite.session";

function readToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function writeToken(token) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: the session lasts until reload */
  }
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = "GET", body } = {}) {
  const token = readToken();
  const response = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(body !== undefined && { "Content-Type": "application/json" }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(data.detail)
      ? "Check the highlighted details and try again."
      : data.detail || "The request could not be completed.";
    throw new ApiError(response.status, detail);
  }
  return data;
}

const SessionContext = createContext({ status: "demo" });

export function SessionProvider({ children }) {
  const [state, setState] = useState(() =>
    !serverMode
      ? { status: "demo" }
      : readToken()
        ? { status: "loading" }
        : { status: "signed-out" },
  );

  useEffect(() => {
    if (state.status !== "loading") return;
    api("/auth/me")
      .then((me) => setState({ status: "signed-in", ...me }))
      .catch(() => {
        writeToken(null);
        setState({ status: "signed-out" });
      });
  }, [state.status]);

  const accept = useCallback((result) => {
    writeToken(result.token);
    setState({ status: "signed-in", user: result.user, firm: result.firm });
  }, []);

  const signIn = useCallback(
    async (email, password) =>
      accept(await api("/auth/login", { method: "POST", body: { email, password } })),
    [accept],
  );
  const signUp = useCallback(
    async (details) =>
      accept(await api("/auth/signup", { method: "POST", body: details })),
    [accept],
  );
  const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      writeToken(null);
      setState({ status: "signed-out" });
    }
  }, []);

  return createElement(
    SessionContext.Provider,
    { value: { ...state, signIn, signUp, signOut } },
    children,
  );
}

export function useSession() {
  return useContext(SessionContext);
}
