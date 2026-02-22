import { z } from 'zod';
import { PlaywrightCrawler, Dataset, createPlaywrightRouter, log, type LogLevel } from 'crawlee';
import type { Locator } from 'playwright';
import { Actor, type ProxyConfigurationOptions } from 'apify';
import { envs } from './env-setup.js';

// ------------------ 1. Definition of Schemas & Types ------------------ //

// Input Interface matches .actor/input_schema.json
interface Input {
  startUrls: { url: string }[];
  maxItems: number;
  proxyConfiguration?: ProxyConfigurationOptions;
  debugLog?: boolean;
}

// Output Schema (Zod) for Validation
const internalJobAdSchema = z.object({
  sourceId: z.string().describe('The ID of the job ad as encoded on the website.'),
  adUrl: z.string().describe('Url for the details page of the ad.'),
  jobTitle: z.string().describe('The title name of the job position.'),
  companyName: z.string().describe('The name of the company.'),
  location: z.string().describe('The location of the company as extracted from the list page.'),
  salary: z.string().nullable().describe('Salary as advertised on the site.'),
  publishedInfoText: z.string().describe("Information appended to search card (e.g. 'New')."),
  scrapedAt: z.coerce.date().describe('The date in ISO format when the ad was scraped.'),
  source: z.string().default('jobs.cz').describe('The source domain name.'),
  htmlDetailPageKey: z
    .string()
    .describe('Key that identifies the html blob from the details page.'),
});

// Helper for cleaning text
function normalizeWhitespace(input: string): string {
  return input
    .replace(/\u00A0/g, ' ') // NBSP → space
    .replace(/\u200D/g, '') // zero-width joiner → gone
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

// ------------------ 2. Router & Handler Logic ------------------ //

const router = createPlaywrightRouter();

router.addHandler('DETAILS', async ({ request, page, log }) => {
  const routerDetailsLog = log.child({ prefix: 'DETAILS' });
  routerDetailsLog.debug(`Processing DETAILS page: ${request.url}`);

  await page.waitForLoadState('load');

  const jobDetailHtml = await page.content();
  const htmlDetailPageKey = `job-html-${request.userData.jobId}.html`;
  const result = {
    sourceId: request.userData.jobId,
    adUrl: request.url,
    jobTitle: request.userData.jobTitle,
    companyName: request.userData.companyName,
    location: request.userData.location,
    salary: request.userData.salary,
    publishedInfoText: request.userData.publishedInfoText,
    scrapedAt: new Date(), // Generates a Date object
    source: 'jobs.cz',
    htmlDetailPageKey,
  };

  const safeResult = internalJobAdSchema.safeParse(result);

  if (safeResult.success) {
    routerDetailsLog.info(`✅ Saved job: ${result.sourceId} | ${result.jobTitle}`);
    await Dataset.pushData(safeResult.data);
  } else {
    routerDetailsLog.error(`⚠️ Validation failed for ${result.sourceId}`, {
      errors: safeResult.error,
    });
    await Dataset.pushData({ ...result, _validationErrors: safeResult.error });
  }
  await Actor.setValue(htmlDetailPageKey, jobDetailHtml, {
    contentType: 'text/html',
  });
});

router.addHandler('LIST', async ({ request, enqueueLinks, page, log, crawler }) => {
  const routerListLog = log.child({ prefix: 'LIST' });
  routerListLog.info(`📂 Scanning List: ${request.url}`);

  try {
    await page.waitForSelector('article.SearchResultCard', { timeout: 5000 });
  } catch (e) {
    routerListLog.warning(`No job cards found on page ${request.url}. Ending pagination. ${e}`);
    return;
  }

  const jobCards = await page.locator('article.SearchResultCard').all();
  routerListLog.info(`Found ${jobCards.length} job cards.`);

  for (const card of jobCards) {
    // Extract Data
    const titleLocator = card.locator('h2[data-test-ad-title]');
    const idLocator = card.locator('a[data-jobad-id]');
    const statusLocator = card.locator('[data-test-ad-status]');
    const locationLocator = card.locator('li[data-test="serp-locality"]');
    const salaryLocator = card.locator('span.Tag--success');
    const companyLocator = card.locator('span[translate="no"]');

    const getSafeText = async (loc: Locator) => {
      if ((await loc.count()) > 0) {
        const elValue = await loc.first().textContent();
        return elValue ? elValue.trim() : null;
      }
      return null;
    };

    const title = await titleLocator.getAttribute('data-test-ad-title');
    const jobId = await idLocator.getAttribute('data-jobad-id');
    const status = (await getSafeText(statusLocator)) || '';
    const location = (await getSafeText(locationLocator)) || '';
    const rawSalary = await getSafeText(salaryLocator);
    const salary = rawSalary ? normalizeWhitespace(rawSalary) : null;
    const company = (await getSafeText(companyLocator)) || '';

    const linkLocator = card.locator('h2[data-test-ad-title] a');
    const href = await linkLocator.getAttribute('href');

    if (!href || !jobId) continue;

    // Enqueue Detail Page
    await crawler.requestQueue?.addRequest({
      url: new URL(href, request.url).toString(),
      label: 'DETAILS',
      userData: {
        jobTitle: title || 'Unknown',
        jobId,
        companyName: company,
        location,
        salary,
        publishedInfoText: status,
      },
    });
  }

  // Pagination
  const nextButton = await page.locator('.Pagination__button--next');
  if ((await nextButton.count()) > 0 && (await nextButton.isEnabled())) {
    await enqueueLinks({
      label: 'LIST',
      selector: '.Pagination__button--next',
    });
  }
});

// ------------------ 3. Main Execution Block ------------------ //

await Actor.init();
// Sanity Check for local run!
const input = await Actor.getInput<Input>();
if (!input) throw new Error('⚠️ Input is missing!');
if (!input.maxItems) throw new Error("⚠️ Input 'maxItems' is required.");

const startUrls = input.startUrls || [{ url: 'https://www.jobs.cz/prace/' }];

// B. Configure Logging
if (input.debugLog) {
  log.setLevel(log.LEVELS.DEBUG);
  log.debug('Debug logging enabled via input.');
} else {
  const envLevel = envs.CRAWLEE_LOG_LEVEL || 'INFO';
  const levelKey = envLevel.toUpperCase() as keyof typeof LogLevel;
  log.setLevel(log.LEVELS[levelKey]);
}

log.debug('Environment configured for actor run.', {
  crawleeLogLevel: envs.CRAWLEE_LOG_LEVEL,
  debugLog: input.debugLog ?? false,
});

// C. Configure Proxy (Store Standard)
const proxyConfiguration = await Actor.createProxyConfiguration(input.proxyConfiguration);

// D. Initialize Crawler
const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  headless: true,
  requestHandler: router,
  maxRequestsPerCrawl: input.maxItems,
  launchContext: {
    launchOptions: {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  },
});

log.info(`🚀 Starting scraper with limit: ${input.maxItems} items.`);

await crawler.run(startUrls.map((req) => ({ ...req, label: 'LIST' })));

await Actor.exit();
