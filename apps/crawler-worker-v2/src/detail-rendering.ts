import type { Page } from 'playwright';

export type DetailRenderType = 'jobscz-template' | 'widget' | 'vacancy-detail' | 'unknown';
export type DetailRenderSignal = 'none' | 'widget_container_text' | 'vacancy_detail_text';

type DetailLogger = {
  debug: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
};

const DETAIL_WIDGET_CONTAINER_SELECTOR = '#widget_container';
const DETAIL_VACANCY_CONTAINER_SELECTOR = '#vacancy-detail';
const DETAIL_VACANCY_LOADER_SELECTOR = '#vacancy-detail .cp-loader';
const DETAIL_WIDGET_RENDER_TIMEOUT_MS = 15_000;
const DETAIL_WIDGET_MIN_TEXT_CHARS = 200;
const DETAIL_VACANCY_RENDER_TIMEOUT_MS = 15_000;
const DETAIL_VACANCY_MIN_TEXT_CHARS = 200;

const isCareerWidgetHostedDetailPage = async (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const widgetContainer = document.querySelector('#widget_container');
    if (!widgetContainer) {
      return false;
    }

    return Array.from(document.scripts).some((script) =>
      (script.textContent ?? '').includes('__LMC_CAREER_WIDGET__'),
    );
  });

const getWidgetContainerTextChars = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const widgetContainer = document.querySelector('#widget_container');
    if (!widgetContainer) {
      return 0;
    }

    return (widgetContainer.textContent ?? '').replace(/\s+/g, ' ').trim().length;
  });

const isVacancyDetailLoaderPage = async (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const vacancyDetail = document.querySelector('#vacancy-detail');
    if (!vacancyDetail) {
      return false;
    }

    const hasLoader = vacancyDetail.querySelector('.cp-loader') !== null;
    const hasDataAssets = vacancyDetail.hasAttribute('data-assets');
    return hasLoader || hasDataAssets;
  });

const getVacancyDetailTextChars = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const vacancyDetail = document.querySelector('#vacancy-detail');
    if (!vacancyDetail) {
      return 0;
    }

    return (vacancyDetail.textContent ?? '').replace(/\s+/g, ' ').trim().length;
  });

export type DetailRenderAssessment = {
  detailRenderType: DetailRenderType;
  detailRenderSignal: DetailRenderSignal;
  detailRenderTextChars: number;
  detailRenderWaitMs: number;
  detailRenderComplete: boolean;
};

export async function waitForDetailRenderReadiness(input: {
  page: Page;
  sourceId: string;
  requestedDetailUrl: string;
  finalDetailUrl: string;
  logger: DetailLogger;
}): Promise<DetailRenderAssessment> {
  const { page, sourceId, requestedDetailUrl, finalDetailUrl, logger } = input;

  let detailRenderWaitMs = 0;
  let detailRenderSignal: DetailRenderSignal = 'none';

  const isWidgetHostedPage = await isCareerWidgetHostedDetailPage(page);
  const isVacancyLoaderPage = !isWidgetHostedPage && (await isVacancyDetailLoaderPage(page));

  if (isWidgetHostedPage) {
    try {
      const startedAt = Date.now();
      await page.waitForFunction(
        ({ selector, minTextChars }) => {
          const container = document.querySelector(selector);
          if (!container) {
            return false;
          }

          return (container.textContent ?? '').replace(/\s+/g, ' ').trim().length >= minTextChars;
        },
        {
          selector: DETAIL_WIDGET_CONTAINER_SELECTOR,
          minTextChars: DETAIL_WIDGET_MIN_TEXT_CHARS,
        },
        { timeout: DETAIL_WIDGET_RENDER_TIMEOUT_MS },
      );
      detailRenderWaitMs = Date.now() - startedAt;
      detailRenderSignal = 'widget_container_text';
    } catch (error) {
      logger.warn('Widget detail page content did not render in time.', {
        err: error,
        sourceId,
        requestedDetailUrl,
        finalDetailUrl,
        widgetTextChars: await getWidgetContainerTextChars(page),
      });
      throw error;
    }
  }

  if (isVacancyLoaderPage) {
    try {
      const startedAt = Date.now();
      await page.waitForFunction(
        ({ containerSelector, loaderSelector, minTextChars }) => {
          const container = document.querySelector(containerSelector);
          if (!container) {
            return false;
          }

          const textLength = (container.textContent ?? '').replace(/\s+/g, ' ').trim().length;
          const hasPrimaryContent =
            container.querySelector('.hero__title') !== null &&
            container.querySelector('.cp-detail__content') !== null;

          if (hasPrimaryContent && textLength >= minTextChars) {
            return true;
          }

          const blockingLoader = Array.from(
            container.querySelectorAll(loaderSelector.replace(`${containerSelector} `, '')),
          ).some((node) => {
            if (!(node instanceof HTMLElement)) {
              return false;
            }

            const style = window.getComputedStyle(node);
            return (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              parseFloat(style.opacity || '1') > 0 &&
              (node.offsetWidth > 0 || node.offsetHeight > 0)
            );
          });

          return !blockingLoader && textLength >= minTextChars;
        },
        {
          containerSelector: DETAIL_VACANCY_CONTAINER_SELECTOR,
          loaderSelector: DETAIL_VACANCY_LOADER_SELECTOR,
          minTextChars: DETAIL_VACANCY_MIN_TEXT_CHARS,
        },
        { timeout: DETAIL_VACANCY_RENDER_TIMEOUT_MS },
      );
      detailRenderWaitMs = Date.now() - startedAt;
      detailRenderSignal = 'vacancy_detail_text';
    } catch (error) {
      logger.warn('Vacancy-detail content did not render in time.', {
        err: error,
        sourceId,
        requestedDetailUrl,
        finalDetailUrl,
        vacancyTextChars: await getVacancyDetailTextChars(page),
      });
      throw error;
    }
  }

  const widgetTextChars = await getWidgetContainerTextChars(page);
  const vacancyTextChars = await getVacancyDetailTextChars(page);
  const detailRenderType: DetailRenderType = isWidgetHostedPage
    ? 'widget'
    : isVacancyLoaderPage
      ? 'vacancy-detail'
      : requestedDetailUrl.includes('jobs.cz')
        ? 'jobscz-template'
        : 'unknown';

  return {
    detailRenderType,
    detailRenderSignal,
    detailRenderTextChars: Math.max(widgetTextChars, vacancyTextChars, 0),
    detailRenderWaitMs,
    detailRenderComplete: detailRenderSignal !== 'none',
  };
}
