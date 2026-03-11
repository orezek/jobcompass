import { expect, test } from '@playwright/test';
import {
  gotoCreatePipelinePage,
  mockCreatePipelineApi,
  submitCreatePipeline,
} from '../_shared/create-pipeline-form';

test('blocks create when required fields are empty', async ({ page }) => {
  const createApi = await mockCreatePipelineApi(page);

  await gotoCreatePipelinePage(page);
  await expect(page.getByLabel('Source')).toHaveValue('jobs.cz');
  await expect(page.getByLabel('Source')).toHaveAttribute('readonly', '');
  await submitCreatePipeline(page);

  await expect(
    page.getByText('Name must be at least 3 characters.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Search space name must be at least 3 characters.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('At least one start URL is required.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Runtime profile name must be at least 3 characters.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('MongoDB URI is required.', { exact: true })).toBeVisible();
  await expect(
    page.getByText('MongoDB database name must be at least 3 characters.', { exact: true }),
  ).toBeVisible();

  expect(createApi.createPayloads).toHaveLength(0);
  expect(createApi.getRunStartRequestCount()).toBe(0);
});
