export async function studioRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json"))
    throw new Error(
      "Cloud services run on Vercel. The local tactical studio works without a server.",
    );
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.message ?? "The request could not be completed.");
  return body as T;
}
