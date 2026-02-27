import type { Page } from 'playwright';

export type DetailRenderType = 'jobscz-template' | 'widget' | 'vacancy-detail' | 'unknown';
export type DetailRenderSignal = 'none' | 'widget_container_text' | 'vacancy_detail_text';

type DetailLogger = {
  debug: (message: string, data?: Record<string, unknown>) => void;
  warning: (message: string, data?: Record<string, unknown>) => void;
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

const getVacancyDetailReadinessSignals = async (
  page: Page,
): Promise<{
  vacancyTextChars: number;
  hasPrimaryContentMarkers: boolean;
  hasBlockingLoader: boolean;
}> =>
  page.evaluate(() => {
    const vacancyDetail = document.querySelector('#vacancy-detail');
    if (!vacancyDetail) {
      return {
        vacancyTextChars: 0,
        hasPrimaryContentMarkers: false,
        hasBlockingLoader: false,
      };
    }

    const vacancyTextChars = (vacancyDetail.textContent ?? '').replace(/\s+/g, ' ').trim().length;
    const hasPrimaryContentMarkers =
      vacancyDetail.querySelector('.hero__title') !== null &&
      vacancyDetail.querySelector('.cp-detail__content') !== null;

    const hasBlockingLoader = Array.from(vacancyDetail.querySelectorAll('.cp-loader')).some(
      (loaderNode) => {
        if (!(loaderNode instanceof HTMLElement)) {
          return false;
        }

        const isSecondarySimilarVacanciesLoader =
          loaderNode.classList.contains('cp-loader--vacancies-list') ||
          loaderNode.closest('.similar') !== null;
        if (isSecondarySimilarVacanciesLoader) {
          return false;
        }

        const computedStyle = window.getComputedStyle(loaderNode);
        const isVisible =
          computedStyle.display !== 'none' &&
          computedStyle.visibility !== 'hidden' &&
          parseFloat(computedStyle.opacity || '1') > 0 &&
          (loaderNode.offsetWidth > 0 || loaderNode.offsetHeight > 0);
        return isVisible;
      },
    );

    return {
      vacancyTextChars,
      hasPrimaryContentMarkers,
      hasBlockingLoader,
    };
  });

export type WaitForDetailRenderReadinessInput = {
  page: Page;
  sourceId: string;
  requestedDetailUrl: string;
  finalDetailUrl: string;
  finalDetailHost: string;
  log: DetailLogger;
};

export type DetailRenderAssessment = {
  detailRenderType: DetailRenderType;
  detailRenderSignal: DetailRenderSignal;
  detailRenderTextChars: number;
  detailRenderWaitMs: number;
  detailRenderComplete: boolean;
  isWidgetHostedPage: boolean;
  widgetContainerTextChars: number;
  isVacancyLoaderPage: boolean;
  vacancyDetailTextChars: number;
};

export async function waitForDetailRenderReadiness(
  input: WaitForDetailRenderReadinessInput,
): Promise<DetailRenderAssessment> {
  const { page, sourceId, requestedDetailUrl, finalDetailUrl, finalDetailHost, log } = input;

  let detailRenderWaitMs = 0;
  let detailRenderSignal: DetailRenderSignal = 'none';

  const isWidgetHostedPage = await isCareerWidgetHostedDetailPage(page);
  const isVacancyLoaderPage = !isWidgetHostedPage && (await isVacancyDetailLoaderPage(page));

  if (isWidgetHostedPage) {
    log.debug(
      'Detected client-hosted jobs.cz widget detail page; waiting for widget content render',
      {
        sourceId,
        requestedDetailUrl,
        finalDetailUrl,
      },
    );

    try {
      const renderWaitStartedAt = Date.now();
      await page.waitForFunction(
        ({ selector, minTextChars }) => {
          const widgetContainer = document.querySelector(selector);
          if (!widgetContainer) {
            return false;
          }

          const text = (widgetContainer.textContent ?? '').replace(/\s+/g, ' ').trim();
          return text.length >= minTextChars;
        },
        {
          selector: DETAIL_WIDGET_CONTAINER_SELECTOR,
          minTextChars: DETAIL_WIDGET_MIN_TEXT_CHARS,
        },
        { timeout: DETAIL_WIDGET_RENDER_TIMEOUT_MS },
      );
      detailRenderWaitMs = Date.now() - renderWaitStartedAt;
      detailRenderSignal = 'widget_container_text';
    } catch (error) {
      const widgetTextChars = await getWidgetContainerTextChars(page);
      log.warning(
        'Widget detail page content did not render in time; throwing to let Crawlee retry',
        {
          err: error,
          sourceId,
          requestedDetailUrl,
          finalDetailUrl,
          widgetTextChars,
          timeoutMs: DETAIL_WIDGET_RENDER_TIMEOUT_MS,
        },
      );
      throw error;
    }
  }

  if (isVacancyLoaderPage) {
    log.debug('Detected dynamic vacancy-detail page; waiting for client-rendered content', {
      sourceId,
      requestedDetailUrl,
      finalDetailUrl,
    });

    try {
      const renderWaitStartedAt = Date.now();
      await page.waitForFunction(
        ({ containerSelector, loaderSelector, minTextChars }) => {
          const vacancyContainer = document.querySelector(containerSelector);
          if (!vacancyContainer) {
            return false;
          }

          const text = (vacancyContainer.textContent ?? '').replace(/\s+/g, ' ').trim();
          const hasPrimaryContentMarkers =
            vacancyContainer.querySelector('.hero__title') !== null &&
            vacancyContainer.querySelector('.cp-detail__content') !== null;

          if (hasPrimaryContentMarkers && text.length >= minTextChars) {
            return true;
          }

          const blockingLoaderStillPresent = Array.from(
            vacancyContainer.querySelectorAll(loaderSelector.replace(`${containerSelector} `, '')),
          ).some((loaderNode) => {
            if (!(loaderNode instanceof HTMLElement)) {
              return false;
            }

            const isSecondarySimilarVacanciesLoader =
              loaderNode.classList.contains('cp-loader--vacancies-list') ||
              loaderNode.closest('.similar') !== null;
            if (isSecondarySimilarVacanciesLoader) {
              return false;
            }

            const computedStyle = window.getComputedStyle(loaderNode);
            const isVisible =
              computedStyle.display !== 'none' &&
              computedStyle.visibility !== 'hidden' &&
              parseFloat(computedStyle.opacity || '1') > 0 &&
              (loaderNode.offsetWidth > 0 || loaderNode.offsetHeight > 0);
            return isVisible;
          });

          return !blockingLoaderStillPresent && text.length >= minTextChars;
        },
        {
          containerSelector: DETAIL_VACANCY_CONTAINER_SELECTOR,
          loaderSelector: DETAIL_VACANCY_LOADER_SELECTOR,
          minTextChars: DETAIL_VACANCY_MIN_TEXT_CHARS,
        },
        { timeout: DETAIL_VACANCY_RENDER_TIMEOUT_MS },
      );
      detailRenderWaitMs = Date.now() - renderWaitStartedAt;
      detailRenderSignal = 'vacancy_detail_text';
    } catch (error) {
      const { vacancyTextChars, hasPrimaryContentMarkers, hasBlockingLoader } =
        await getVacancyDetailReadinessSignals(page);
      log.warning(
        'Dynamic vacancy-detail page content did not render in time; throwing to let Crawlee retry',
        {
          err: error,
          sourceId,
          requestedDetailUrl,
          finalDetailUrl,
          vacancyTextChars,
          hasPrimaryContentMarkers,
          hasBlockingLoader,
          timeoutMs: DETAIL_VACANCY_RENDER_TIMEOUT_MS,
        },
      );
      throw error;
    }
  }

  const widgetContainerTextChars = isWidgetHostedPage ? await getWidgetContainerTextChars(page) : 0;
  const vacancyDetailTextChars = isVacancyLoaderPage ? await getVacancyDetailTextChars(page) : 0;

  if (isWidgetHostedPage && widgetContainerTextChars < DETAIL_WIDGET_MIN_TEXT_CHARS) {
    log.warning(
      'Widget detail page appears incomplete after render wait; throwing to let Crawlee retry',
      {
        sourceId,
        requestedDetailUrl,
        finalDetailUrl,
        widgetContainerTextChars,
      },
    );
    throw new Error(
      `Widget detail page not fully rendered for job ${sourceId} (widget text chars: ${widgetContainerTextChars})`,
    );
  }

  if (isVacancyLoaderPage && vacancyDetailTextChars < DETAIL_VACANCY_MIN_TEXT_CHARS) {
    log.warning(
      'Dynamic vacancy-detail page appears incomplete after render wait; throwing to let Crawlee retry',
      {
        sourceId,
        requestedDetailUrl,
        finalDetailUrl,
        vacancyDetailTextChars,
      },
    );
    throw new Error(
      `Dynamic vacancy-detail page not fully rendered for job ${sourceId} (vacancy detail text chars: ${vacancyDetailTextChars})`,
    );
  }

  const detailRenderType: DetailRenderType = isWidgetHostedPage
    ? 'widget'
    : isVacancyLoaderPage
      ? 'vacancy-detail'
      : finalDetailHost === 'www.jobs.cz' || finalDetailHost === 'jobs.cz'
        ? 'jobscz-template'
        : 'unknown';

  const detailRenderTextChars = isWidgetHostedPage
    ? widgetContainerTextChars
    : isVacancyLoaderPage
      ? vacancyDetailTextChars
      : 0;

  const detailRenderComplete = isWidgetHostedPage
    ? widgetContainerTextChars >= DETAIL_WIDGET_MIN_TEXT_CHARS
    : isVacancyLoaderPage
      ? vacancyDetailTextChars >= DETAIL_VACANCY_MIN_TEXT_CHARS
      : true;

  return {
    detailRenderType,
    detailRenderSignal,
    detailRenderTextChars,
    detailRenderWaitMs,
    detailRenderComplete,
    isWidgetHostedPage,
    widgetContainerTextChars,
    isVacancyLoaderPage,
    vacancyDetailTextChars,
  };
}
