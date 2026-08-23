import OpenAI from 'openai';

/**
 * NVIDIA NIM (Nemotron) 백엔드.
 *
 * OpenAI 호환 엔드포인트라 openai SDK 를 그대로 쓴다.
 *
 * 왜 기본값인가: Claude CLI 백엔드는 호출 한 번에 프로세스를 새로 띄우느라 왕복이
 * 2분 안팎이었다. 같은 크기의 요청이 여기서는 수 초에 끝난다. 기사 한 건을 내는 데
 * 분류·집필·평가·개정으로 5회 이상 부르는 구조라 이 차이가 그대로 운영 속도가 된다.
 *
 * 주의할 점 두 가지.
 *
 * 1) 이 모델은 사고 과정을 `reasoning_content` 로 따로 흘려보낸다. 그걸 본문에 섞으면
 *    기사에 모델의 혼잣말이 들어간다. 스트림에서 두 필드를 분리해 content 만 모은다.
 * 2) 구조화 출력(JSON 스키마 강제)을 신뢰할 수 없다. 그래서 CLI 백엔드에서 쓰던
 *    구분자 블록 형식을 그대로 쓴다 — 본문에 따옴표·줄바꿈이 아무리 많아도 안 깨진다.
 */

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error(
      'NVIDIA_API_KEY 가 없습니다. .env 에 키를 넣거나 LLM_BACKEND 를 api/cli 로 바꾸세요.',
    );
  }
  if (!client) {
    client = new OpenAI({
      apiKey,
      baseURL: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      // 긴 기사를 뽑을 때 기본 타임아웃(10분)으로는 모자랄 일이 없지만,
      // 네트워크가 멈춘 채 매달리는 것을 막으려 명시한다.
      timeout: 300_000,
      maxRetries: 2,
    });
  }
  return client;
}

export const NVIDIA_MODEL = () =>
  process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b';

export interface NvidiaOptions {
  /** 기본 16384. 분류처럼 짧은 응답이면 줄여서 대기 시간을 아낀다. */
  maxTokens?: number;
  model?: string;
}

/**
 * 시스템·사용자 프롬프트를 넣고 본문 텍스트만 돌려받는다.
 *
 * 스트리밍을 쓰는 이유: 논스트리밍으로 max_tokens 를 크게 잡으면 응답이 다 만들어질
 * 때까지 연결이 조용히 열려 있어 프록시나 게이트웨이에서 끊기는 일이 생긴다.
 * 어차피 전부 모아서 쓰므로 결과는 같다.
 */
export async function runNvidia(
  prompt: string,
  system: string,
  opts: NvidiaOptions = {},
): Promise<string> {
  const stream = await getClient().chat.completions.create({
    model: opts.model || NVIDIA_MODEL(),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    temperature: 1,
    top_p: 0.95,
    max_tokens: opts.maxTokens ?? 16384,
    // 사고를 켜면 판단이 필요한 작업(분류·평가)에서 결과가 눈에 띄게 안정적이다.
    // 사고 내용 자체는 reasoning_content 로 따로 오므로 본문에는 섞이지 않는다.
    chat_template_kwargs: { enable_thinking: true },
    stream: true,
  } as Parameters<OpenAI['chat']['completions']['create']>[0]);

  let content = '';
  for await (const chunk of stream as AsyncIterable<{
    choices: { delta?: { content?: string | null; reasoning_content?: string | null } }[];
  }>) {
    const delta = chunk.choices[0]?.delta;
    // reasoning_content 는 의도적으로 버린다. 기사에 모델의 혼잣말이 들어가면 안 된다.
    if (delta?.content) content += delta.content;
  }

  if (!content.trim()) {
    throw new Error('NVIDIA 응답이 비어 있습니다 (사고만 하고 본문을 내지 않음)');
  }
  return content;
}
