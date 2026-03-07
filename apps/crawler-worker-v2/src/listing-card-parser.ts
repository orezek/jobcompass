import type { Locator } from 'playwright';

export type CrawlListingRecord = {
  source: string;
  sourceId: string;
  adUrl: string;
  jobTitle: string;
  companyName: string;
  location: string;
  salary: string | null;
  publishedInfoText: string;
};

const SALARY_SELECTOR = 'span.Tag--success, [data-test="serp-salary"]';

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\u00A0/g, ' ')
    .replace(/\u200D/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getSafeText(locator: Locator): Promise<string | null> {
  if ((await locator.count()) === 0) {
    return null;
  }

  const value = await locator.first().textContent();
  return value ? value.trim() : null;
}

export async function extractListingFromCard(input: {
  card: Locator;
  baseUrl: string;
  source: string;
}): Promise<CrawlListingRecord | null> {
  const { card, baseUrl, source } = input;
  const titleLocator = card.locator('h2[data-test-ad-title]');
  const idLocator = card.locator('a[data-jobad-id]');
  const statusLocator = card.locator('[data-test-ad-status]');
  const locationLocator = card.locator('li[data-test="serp-locality"]');
  const salaryLocator = card.locator(SALARY_SELECTOR);
  const companyLocator = card.locator('span[translate="no"]');
  const linkLocator = card.locator('h2[data-test-ad-title] a');

  const title = await titleLocator.getAttribute('data-test-ad-title');
  const sourceId = await idLocator.getAttribute('data-jobad-id');
  const href = await linkLocator.getAttribute('href');

  if (!href || !sourceId) {
    return null;
  }

  const publishedInfoText = (await getSafeText(statusLocator)) ?? '';
  const location = (await getSafeText(locationLocator)) ?? '';
  const rawSalary = await getSafeText(salaryLocator);
  const companyName = (await getSafeText(companyLocator)) ?? '';

  return {
    source,
    sourceId,
    adUrl: new URL(href, baseUrl).toString(),
    jobTitle: title?.trim() || 'Unknown title',
    companyName,
    location,
    salary: rawSalary ? normalizeWhitespace(rawSalary) : null,
    publishedInfoText,
  };
}
