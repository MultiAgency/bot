import { Scraper } from '@the-convocation/twitter-scraper';

// Cookie-based (unofficial) X/Twitter access - not the paid API. See
// README.md "Candidate evaluation" for the real risks: this violates X's
// Terms of Service, the logged-in account can be suspended at any time, and
// it breaks whenever X changes its internal endpoints (no SLA). Only use a
// dedicated/throwaway account's cookies, never a primary brand account.
//
// TWITTER_COOKIES must be a JSON array of cookie strings exported from a
// logged-in browser session for that account.
let scraperPromise = null;

function getScraper() {
  if (!process.env.TWITTER_COOKIES) return null;
  if (!scraperPromise) {
    scraperPromise = (async () => {
      const scraper = new Scraper();
      const cookies = JSON.parse(process.env.TWITTER_COOKIES);
      await scraper.setCookies(cookies);
      return scraper;
    })();
  }
  return scraperPromise;
}

// Returns null if TWITTER_COOKIES isn't configured, the session isn't
// logged in (expired/invalid cookies), or the profile can't be found -
// callers should treat that as "unscored", not an error.
export async function fetchTwitterProfile(handle) {
  const pending = getScraper();
  if (!pending) return null;

  const client = await pending;
  if (!(await client.isLoggedIn())) return null;

  return client.getProfile(handle);
}
