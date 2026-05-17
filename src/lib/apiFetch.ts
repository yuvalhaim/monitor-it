let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(cb: () => void) {
  onUnauthorized = cb;
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, options);
  if (res.status === 401 && onUnauthorized) {
    onUnauthorized();
  }
  return res;
}
