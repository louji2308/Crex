export { createProvider } from "./providers.js";
export type { AiProvider } from "./providers.js";
export { withFallback } from "./fallback.js";
export type { WithFallbackOptions } from "./fallback.js";
export { validateAiResult } from "./validate.js";
export type { ValidateAiResultOptions } from "./validate.js";
export {
  chatCompletions,
  chatCompletionsWithSchema,
} from "./client.js";
export type { ChatCompletionsOptions, ChatCompletionsWithSchemaOptions } from "./client.js";
export {
  ProviderRateLimitError,
  ProviderTimeoutError,
  ProviderAuthFailedError,
  ProviderNotFoundError,
  ProviderInvalidRequestError,
  ProviderUnavailableError,
  ProviderParseError,
  ProviderSchemaRejectionError,
} from "./errors.js";
export { isRetryableProviderError } from "./errors.js";
export {
  providerNameSchema,
  chatMessageSchema,
  providerRequestSchema,
  aiProviderResultSchema,
  providerOptionsSchema,
} from "./types.js";
export type {
  ProviderName,
  ChatMessage,
  ProviderRequest,
  AiProviderResult,
  ProviderRequestId,
  ProviderOptions,
} from "./types.js";
export {
  createSttProvider,
  withSttFallback,
} from "./stt.js";
export type {
  SttProvider,
  SttTranscribeOptions,
  SttTranscriptionResult,
  SttSegment,
  CreateSttProviderOptions,
  WithSttFallbackOptions,
} from "./stt.js";
