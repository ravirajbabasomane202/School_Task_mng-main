/** Pull the backend's `message` out of an Axios-style error, or fall back. */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

/** True when the server says the record is already gone (HTTP 404). */
export function isNotFoundError(err: unknown): boolean {
  return (err as { response?: { status?: number } })?.response?.status === 404;
}
