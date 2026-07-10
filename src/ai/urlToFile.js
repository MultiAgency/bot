// Converts a submitted URL into standardized text content via Jina Reader
// (https://r.jina.ai/), so AI and reviewers analyze stored content instead of
// a raw live URL. Free tier: 20 req/min without a key, 500 req/min with
// JINA_API_KEY set - works either way.
const JINA_READER_BASE = 'https://r.jina.ai/';

export async function convertUrlToFile(sourceUrl) {
  const headers = { Accept: 'text/plain' };
  if (process.env.JINA_API_KEY) {
    headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
  }

  try {
    const response = await fetch(JINA_READER_BASE + sourceUrl, { headers });

    if (!response.ok) {
      return {
        sourceUrl,
        convertedText: null,
        conversionFailed: true,
        error: `Jina Reader returned ${response.status}`,
        fetchedAt: new Date().toISOString(),
      };
    }

    const convertedText = await response.text();
    return {
      sourceUrl,
      convertedText,
      conversionFailed: false,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      sourceUrl,
      convertedText: null,
      conversionFailed: true,
      error: err.message,
      fetchedAt: new Date().toISOString(),
    };
  }
}
