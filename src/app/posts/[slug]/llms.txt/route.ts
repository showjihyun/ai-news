import { getAllPosts, getPost } from '@/lib/posts';
import { site, postUrl } from '@/lib/site';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

/**
 * 기사 한 건의 원문 마크다운.
 *
 * 에이전트가 HTML 에서 본문을 긁어내려면 광고 슬롯·네비게이션·관련글을 걸러내야 하고,
 * 그 과정에서 문장이 잘리거나 엉뚱한 텍스트가 섞인다. 잘못 인용되면 우리 신뢰가 깎인다.
 * 출처와 집필 방식까지 함께 담은 깨끗한 텍스트를 직접 내주는 편이 서로에게 낫다.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    /* 그대로 사용 */
  }

  const post = getPost(decoded);
  if (!post) return new Response('Not found', { status: 404 });

  const body = [
    `# ${post.title}`,
    '',
    `> ${post.oneLiner || post.description}`,
    '',
    `- 매체: ${site.name}`,
    `- 담당: ${post.desk}`,
    `- 분야: ${post.category}`,
    `- 발행: ${post.date}`,
    `- 원문 주소(웹): ${postUrl(post.slug)}`,
    `- 태그: ${post.tags.join(', ')}`,
    '',
    '---',
    '',
    post.body.trim(),
    '',
    '---',
    '',
    '## 출처',
    '',
    ...post.sources.map((s) => `- [${s.origin}] ${s.title} — ${s.url}`),
    '',
    '## 집필 방식 고지',
    '',
    '이 기사는 위 원문과 커뮤니티 반응을 바탕으로 AI의 도움을 받아 작성했으며, 발행 전 사람이 확인했습니다.',
    `인용 시 출처를 "${site.name}"으로 표기하고 ${postUrl(post.slug)} 로 연결해 주세요.`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
