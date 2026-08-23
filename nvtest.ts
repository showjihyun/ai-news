import { loadEnv } from './pipeline/env.js';
loadEnv();
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: process.env.NVIDIA_BASE_URL,
});

const t0 = Date.now();
const stream = await client.chat.completions.create({
  model: process.env.NVIDIA_MODEL!,
  messages: [
    { role: 'system', content: '당신은 한국어 뉴스 기자입니다. 간결하게 답합니다.' },
    { role: 'user', content: 'AI 뉴스 블로그 제목을 하나만 지어 주세요. 제목만 출력하세요.' },
  ],
  temperature: 1,
  top_p: 0.95,
  max_tokens: 2000,
  stream: true,
} as any);

let content = '', reasoning = '';
for await (const chunk of stream as any) {
  const d = chunk.choices[0]?.delta;
  if (d?.reasoning_content) reasoning += d.reasoning_content;
  if (d?.content) content += d.content;
}
console.log('소요:', ((Date.now()-t0)/1000).toFixed(1)+'초');
console.log('reasoning 길이:', reasoning.length);
console.log('content:', JSON.stringify(content.trim().slice(0,200)));
