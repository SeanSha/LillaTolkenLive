import {
  DEFAULT_INPUT_TRANSCRIPTION_MODEL,
  DEFAULT_TRANSLATION_MODEL,
  TRANSLATION_CLIENT_SECRET_URL,
  noiseReductionFor,
  normalizeTargetLanguage,
  type InputProfile,
} from '@lilla/shared';

export { TRANSLATION_CLIENT_SECRET_URL };

export class OpenAIRequestError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`OpenAI request failed with status ${status}.`);
    this.name = 'OpenAIRequestError';
    this.status = status;
    this.body = body;
  }
}

export function buildClientSecretRequest(input: {
  apiKey: string;
  targetLanguage: string;
  model?: string;
  inputTranscriptionModel?: string;
  inputProfile?: InputProfile;
}) {
  if (!input.apiKey) {
    throw new Error('OPENAI_API_KEY is required.');
  }

  const language = normalizeTargetLanguage(input.targetLanguage);
  const model = input.model || DEFAULT_TRANSLATION_MODEL;
  const inputTranscriptionModel = input.inputTranscriptionModel || DEFAULT_INPUT_TRANSCRIPTION_MODEL;
  const body = {
    session: {
      model,
      audio: {
        input: {
          transcription: { model: inputTranscriptionModel },
          noise_reduction: noiseReductionFor(input.inputProfile),
        },
        output: { language },
      },
    },
  };

  return {
    url: TRANSLATION_CLIENT_SECRET_URL,
    init: {
      method: 'POST' as const,
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    language,
    model,
    inputTranscriptionModel,
    inputProfile: input.inputProfile,
  };
}

export async function createClientSecret(input: {
  apiKey: string;
  targetLanguage: string;
  model?: string;
  inputTranscriptionModel?: string;
  inputProfile?: InputProfile;
  fetchImpl?: typeof fetch;
}) {
  const request = buildClientSecretRequest(input);
  const response = await (input.fetchImpl ?? fetch)(request.url, request.init);
  if (!response.ok) {
    throw new OpenAIRequestError(response.status, await readBody(response));
  }

  const data = (await response.json()) as { value?: unknown; expires_at?: unknown; session?: unknown };
  if (typeof data.value !== 'string' || !data.value) {
    throw new Error('OpenAI did not return a client secret value.');
  }

  return {
    client_secret: data.value,
    expires_at: data.expires_at ?? null,
    model: request.model,
    session: data.session ?? null,
    targetLanguage: request.language,
  };
}

async function readBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
