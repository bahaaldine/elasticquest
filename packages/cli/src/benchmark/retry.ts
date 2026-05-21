const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const RETRYABLE_STATUS_CODES = [429, 529];

/**
 * Wrapper around fetch that retries on 429 (rate limit) and 529 (overloaded)
 * with exponential backoff. Respects Retry-After header when present.
 */
export async function retryFetch(
  url: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, init);

    if (!RETRYABLE_STATUS_CODES.includes(response.status) || attempt === MAX_RETRIES) {
      return response;
    }

    lastResponse = response;

    const retryAfterHeader = response.headers.get('retry-after');
    let delayMs: number;

    if (retryAfterHeader) {
      const seconds = parseInt(retryAfterHeader, 10);
      delayMs = isNaN(seconds) ? BASE_DELAY_MS * 2 ** attempt : seconds * 1000;
    } else {
      delayMs = BASE_DELAY_MS * 2 ** attempt;
    }

    process.stderr.write(
      `  [retry] ${response.status} rate limited, waiting ${(delayMs / 1000).toFixed(1)}s (attempt ${attempt + 1}/${MAX_RETRIES})...\n`,
    );

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return lastResponse!;
}
