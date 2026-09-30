/**
 * Indexing temporarily disabled.
 *
 * Set this to true to index the marketing site again. That one edit
 * restores index,follow on marketing pages, the sitemap, llms.txt,
 * JSON-LD, and the previous robots.txt. The app shell stays noindex
 * either way.
 * Steps: docs/seo-indexing.md
 */
export const SEO_INDEXING_ENABLED = false;

/** Served at /robots.txt while SEO_INDEXING_ENABLED is false. */
export const QUIET_ROBOTS_TXT = `# Indexing temporarily disabled.
# Crawling stays allowed so crawlers can fetch each page, see the
# noindex directive, and drop URLs that are already indexed.
User-agent: *
Allow: /
`;

/**
 * Served at /robots.txt when SEO_INDEXING_ENABLED is true.
 * This is the policy that was live before quiet use.
 */
export const INDEXABLE_ROBOTS_TXT = `# Search engines and AI crawlers may fetch the public marketing pages.
# Answer bots and training bots are allowed (GPTBot, Google-Extended,
# and the rest of the group below). The app surface is disallowed.
# A more specific User-agent group does not inherit rules from "*",
# so every bot shares this one group.
User-agent: *
User-agent: Googlebot
User-agent: Google-Extended
User-agent: Bingbot
User-agent: DuckDuckBot
User-agent: Applebot
User-agent: Applebot-Extended
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: ClaudeBot
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: anthropic-ai
User-agent: Amazonbot
User-agent: CCBot
User-agent: Bytespider
User-agent: meta-externalagent
User-agent: FacebookBot
User-agent: cohere-ai
User-agent: DuckAssistBot
Allow: /

# App shell and authenticated / transactional surfaces.
Disallow: /app$
Disallow: /app/
Disallow: /signin
Disallow: /signup
Disallow: /forgot-password
Disallow: /check-email
Disallow: /auth/
Disallow: /debug/
Disallow: /sign/
Disallow: /verify/
Disallow: /document/
Disallow: /documents
Disallow: /signers
Disallow: /contacts
Disallow: /templates
Disallow: /settings/
Disallow: /m/
Disallow: /oauth/
Disallow: /sent/

Sitemap: https://seald.nromomentum.com/sitemap.xml
`;

export function robotsTxt() {
  return SEO_INDEXING_ENABLED ? INDEXABLE_ROBOTS_TXT : QUIET_ROBOTS_TXT;
}
