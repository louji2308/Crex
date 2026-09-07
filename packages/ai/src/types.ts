import { z } from "zod";
import { isoDateTimeSchema, uuidSchema, aiTaskSchema } from "@crex/schemas";

export const providerNameSchema = z.enum(["nvidia", "mistral", "openrouter"]);
export type ProviderName = z.infer<typeof providerNameSchema>;

export const chatMessageSchema = z.strictObject({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const providerRequestSchema = z.strictObject({
  messages: z.array(chatMessageSchema).min(1),
  task: z.union([aiTaskSchema, z.string().min(1)]),
  targetSchema: z.record(z.string(), z.unknown()).optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(32768).optional(),
  response_format: z.strictObject({ type: z.literal("json_object") }).optional(),
});

export type ProviderRequest = z.infer<typeof providerRequestSchema>;

export const aiProviderResultSchema = z.strictObject({
  primary_provider: providerNameSchema,
  provider_used: providerNameSchema,
  fallback_active: z.boolean(),
  fallback_reason: z.string().nullable(),
  model: z.string().min(1),
  raw_output: z.string(),
  normalized: z.unknown(),
  valid: z.boolean(),
  validation_errors: z.array(z.string()),
  task: z.string(),
  schema_version: z.string().min(1),
  created_at: isoDateTimeSchema,
  duration_ms: z.number().min(0),
});

export type AiProviderResult = z.infer<typeof aiProviderResultSchema>;

export type ProviderRequestId = string;

export interface OpenAIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAIChatCompletionBody {
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
}

export interface OpenAIChoice {
  index: number;
  message: { role: string; content: string };
  finish_reason: string;
}

export interface OpenAIChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export const providerOptionsSchema = z.strictObject({
  nvidiaApiKey: z.string().optional(),
  nvidiaBaseUrl: z.string().url(),
  nvidiaModel: z.string().min(1),
  mistralApiKey: z.string().optional(),
  mistralBaseUrl: z.string().url(),
  mistralModel: z.string().min(1),
  openrouterApiKey: z.string().optional(),
  openrouterBaseUrl: z.string().url(),
  openrouterModel: z.string().min(1),
  aiTimeoutMs: z.number().int().min(1),
  aiMaxRetries: z.number().int().min(0),
  aiRetryBaseDelayMs: z.number().int().min(1),
});

export type ProviderOptions = z.infer<typeof providerOptionsSchema>;
