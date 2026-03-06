import type { FastifyBaseLogger } from 'fastify';
import {
  FixtureDetailTextCleaner,
  FixtureJobDetailExtractor,
  GeminiDetailTextCleaner,
  GeminiJobDetailExtractor,
} from './extraction.js';
import { JobParsingGraph } from './job-parsing-graph.js';
import {
  sourceListingRecordSchema,
  type SourceListingRecord,
  type UnifiedJobAd,
} from './schema.js';

type ParserBackend = 'gemini' | 'fixture';
type ThinkingLevel = 'THINKING_LEVEL_UNSPECIFIED' | 'LOW' | 'MEDIUM' | 'HIGH';

export type FullModelParserConfig = {
  logger: FastifyBaseLogger;
  parserBackend: ParserBackend;
  parserVersion: string;
  logTextTransformContent: boolean;
  textTransformPreviewChars: number;
  minRelevantTextChars: number;
  llmExtractorPromptName: string;
  llmCleanerPromptName: string;
  geminiApiKey?: string;
  langsmithApiKey?: string;
  geminiModel: string;
  geminiTemperature: number;
  geminiThinkingLevel: ThinkingLevel | null;
  geminiInputPriceUsdPerMillionTokens: number;
  geminiOutputPriceUsdPerMillionTokens: number;
};

export type ParseFullModelInput = {
  runId: string;
  crawlRunId: string | null;
  searchSpaceId: string;
  detailHtmlPath: string;
  listingRecord: SourceListingRecord;
};

type LocalInputRecord = {
  listingRecord: ReturnType<typeof sourceListingRecordSchema.parse>;
  detailHtmlPath: string;
};

export class FullModelParser {
  private readonly parserGraphCache = new Map<string, Promise<JobParsingGraph>>();

  public constructor(private readonly config: FullModelParserConfig) {}

  public async parse(input: ParseFullModelInput): Promise<UnifiedJobAd> {
    const parserGraph = await this.getParserGraph(input.searchSpaceId);

    const listingRecord = sourceListingRecordSchema.parse(input.listingRecord);

    const inputRecord: LocalInputRecord = {
      listingRecord,
      detailHtmlPath: input.detailHtmlPath,
    };

    return parserGraph.parseRecord(inputRecord, {
      runId: input.runId,
      crawlRunId: input.crawlRunId,
    });
  }

  private async getParserGraph(searchSpaceId: string): Promise<JobParsingGraph> {
    const cacheKey = searchSpaceId;
    const cached = this.parserGraphCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const created = this.createParserGraph(searchSpaceId).catch((error) => {
      this.parserGraphCache.delete(cacheKey);
      throw error;
    });
    this.parserGraphCache.set(cacheKey, created);
    return created;
  }

  private async createParserGraph(searchSpaceId: string): Promise<JobParsingGraph> {
    const extractor =
      this.config.parserBackend === 'fixture'
        ? new FixtureJobDetailExtractor()
        : new GeminiJobDetailExtractor({
            langsmithApiKey: this.required(
              this.config.langsmithApiKey,
              'LANGSMITH_API_KEY is required when INGESTION_PARSER_BACKEND=gemini.',
            ),
            langsmithPromptName: this.config.llmExtractorPromptName,
            apiKey: this.required(
              this.config.geminiApiKey,
              'GEMINI_API_KEY is required when INGESTION_PARSER_BACKEND=gemini.',
            ),
            model: this.config.geminiModel,
            temperature: this.config.geminiTemperature,
            thinkingLevel: this.config.geminiThinkingLevel,
            inputPriceUsdPerMillionTokens: this.config.geminiInputPriceUsdPerMillionTokens,
            outputPriceUsdPerMillionTokens: this.config.geminiOutputPriceUsdPerMillionTokens,
            logger: this.config.logger,
          });

    const textCleaner =
      this.config.parserBackend === 'fixture'
        ? new FixtureDetailTextCleaner()
        : new GeminiDetailTextCleaner({
            langsmithApiKey: this.required(
              this.config.langsmithApiKey,
              'LANGSMITH_API_KEY is required when INGESTION_PARSER_BACKEND=gemini.',
            ),
            langsmithPromptName: this.config.llmCleanerPromptName,
            apiKey: this.required(
              this.config.geminiApiKey,
              'GEMINI_API_KEY is required when INGESTION_PARSER_BACKEND=gemini.',
            ),
            model: this.config.geminiModel,
            temperature: this.config.geminiTemperature,
            thinkingLevel: this.config.geminiThinkingLevel,
            inputPriceUsdPerMillionTokens: this.config.geminiInputPriceUsdPerMillionTokens,
            outputPriceUsdPerMillionTokens: this.config.geminiOutputPriceUsdPerMillionTokens,
            logger: this.config.logger,
          });

    return new JobParsingGraph({
      textCleaner,
      extractor,
      minRelevantTextChars: this.config.minRelevantTextChars,
      logTextTransformContent: this.config.logTextTransformContent,
      textTransformPreviewChars: this.config.textTransformPreviewChars,
      parserVersion: this.config.parserVersion,
      searchSpaceId,
      logger: this.config.logger,
    });
  }

  private required(value: string | undefined, errorMessage: string): string {
    if (!value) {
      throw new Error(errorMessage);
    }

    return value;
  }
}
