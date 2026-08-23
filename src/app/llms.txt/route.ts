import { getAllPosts, getCategories } from '@/lib/posts';
import { site } from '@/lib/site';
import { PERSONA_BEATS } from '@/lib/desks';

export const dynamic = 'force-static';

/**
 * /llms.txt — LLM·에이전트를 위한 사이트 안내서.
 *
 * HTML 을 파싱해서 본문을 찾아내는 대신, 무엇을 다루는 사이트이고 어떤 글이 있으며
 * 각 글의 원문(마크다운)을 어디서 가져가면 되는지 한 파일에 정리해 준다.
 * 에이전트가 답변에 출처를 붙일 때 이 경로를 먼저 보는 흐름이 자리잡고 있다.
 *
 * 각 기사에는 .md 원문 링크를 같이 적는다. 광고·네비게이션이 섞인 HTML 보다
 * 정확하게 인용되고, 인용이 정확할수록 다시 인용된다.
 */
export function GET() {
  const posts = getAllPosts();
  const categories = getCategories();

  const lines = [
    `# ${site.name}`,
    '',
    `> ${site.description}`,
    '',
    '## 이 사이트에 대해',
    '',
    '- 언어: 한국어',
    '- 주제: 인공지능(AI) 뉴스와 해설',
    '- 대상 독자: AI 비전문가',
    '- 갱신 주기: 하루 여러 차례',
    `- 발행 기사 수: ${posts.length}`,
    '',
    '## 취재·집필 방식',
    '',
    '- Hacker News, Reddit(r/LocalLLaMA·r/OpenAI 등), GeekNews, 네이버, 그리고 OpenAI·Google DeepMind·Hugging Face 등의 공식 발표를 동시에 수집합니다.',
    '- 여러 출처에서 동시에 화제가 된 사안만 기사화합니다.',
    '- 기사는 공개된 원문과 커뮤니티 반응을 바탕으로 AI의 도움을 받아 작성하며, 발행 전 사람이 확인합니다.',
    '- 모든 기사 하단에 원문 출처 링크를 표기합니다. 각 기사 페이지의 JSON-LD `citation` 필드에도 같은 출처가 들어 있습니다.',
    '',
    '## 인용 안내',
    '',
    `- 각 기사의 원문 마크다운은 기사 주소 뒤에 \`llms.txt\` 를 붙이면 받을 수 있습니다. 예: ${site.url}/posts/<slug>/llms.txt`,
    '- 인용 시 매체명 표기: ' + site.name,
    `- 전체 목록: ${site.url}/sitemap.xml · RSS: ${site.url}/rss.xml`,
    '',
    '## 분야',
    '',
    ...categories.map((c) => `- **${c.name}** (${c.count}건): ${PERSONA_BEATS[c.name] ?? ''}`),
    '',
    '## 기사 목록 (최신순)',
    '',
    ...posts.slice(0, 200).map((p) => {
      const date = p.date.slice(0, 10);
      return `- [${p.title}](${site.url}/posts/${p.slug}/): ${date} · ${p.category} · ${p.oneLiner || p.description} · 원문 마크다운: ${site.url}/posts/${p.slug}/llms.txt`;
    }),
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
