import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllPosts, getPost, getRelated, renderMarkdown } from '@/lib/posts';
import { AdSlot } from '@/components/AdSlot';
import { site, categoryColor, formatDateTime } from '@/lib/site';
import { LiveTime } from '@/components/LiveTime';
import { toSafeJsonLd, breadcrumbJsonLd } from '@/lib/jsonld';

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

/**
 * Next 는 params 를 URL 인코딩된 상태로 넘겨준다. 한글 슬러그라 디코딩하지 않으면
 * getPost() 가 못 찾고 notFound() 로 빠져서, 빌드는 성공하는데 본문이 비어 있는
 * 껍데기 HTML 이 만들어진다. 실제로 모든 기사 페이지가 그 상태로 빌드됐었다.
 */
function decodeSlug(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(decodeSlug(slug));
  if (!post) return {};

  const url = `${site.url}/posts/${post.slug}/`;
  return {
    title: post.title,
    description: post.description,
    keywords: post.tags,
    alternates: {
      canonical: url,
      // 에이전트가 HTML 을 긁는 대신 깨끗한 마크다운을 가져가게 한다.
      types: { 'text/plain': `${url}llms.txt` },
    },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      url,
      publishedTime: post.date,
      tags: post.tags,
      siteName: site.name,
      locale: site.locale,
    },
    twitter: { card: 'summary_large_image', title: post.title, description: post.description },
  };
}

/**
 * 본문 중간 광고 삽입.
 *
 * 애드센스에서 가장 성과가 좋은 자리는 첫 스크롤 직후 본문 안쪽이다. 다만 아무 데나
 * 끼우면 문장이 끊겨 이탈이 늘기 때문에, 반드시 H2 섹션 경계에서만 자른다.
 */
function splitAtSection(html: string, afterNthHeading = 2): [string, string] {
  const positions: number[] = [];
  const re = /<h2\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) positions.push(m.index);

  if (positions.length <= afterNthHeading) return [html, ''];
  const cut = positions[afterNthHeading];
  return [html.slice(0, cut), html.slice(cut)];
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(decodeSlug(slug));
  if (!post) notFound();

  const html = renderMarkdown(post.body);
  const [first, rest] = splitAtSection(html);
  const related = getRelated(post);
  const color = categoryColor(post.category);

  const pageUrl = `${site.url}/posts/${post.slug}/`;

  /*
    AI 엔진이 답변에 출처를 붙일 때 판단하는 것들을 전부 명시한다.
    - abstract/backstory: 무엇을 다룬 글인지 한 문장으로 뽑아 갈 수 있게
    - citation + isBasedOn: 우리가 무엇을 근거로 썼는지 (재인용 가능한 1차 출처)
    - creditText: 인용할 때 어떤 이름으로 표기하면 되는지 못박기
    - about/keywords: 주제 매칭
    - speakable: 음성 어시스턴트가 읽어 줄 부분 지정
  */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    '@id': `${pageUrl}#article`,
    headline: post.title,
    description: post.description,
    abstract: post.oneLiner || post.description,
    datePublished: post.date,
    dateModified: post.date,
    inLanguage: 'ko',
    isAccessibleForFree: true,
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
    url: pageUrl,
    author: {
      '@type': 'Organization',
      name: `${site.name} ${post.desk}`,
      url: `${site.url}/about/`,
    },
    publisher: { '@id': `${site.url}/#organization` },
    creditText: site.name,
    keywords: post.tags.join(', '),
    about: post.tags.map((t) => ({ '@type': 'Thing', name: t })),
    articleSection: post.category,
    wordCount: post.body.replace(/\s/g, '').length,
    timeRequired: `PT${post.readingMinutes}M`,
    // 출처를 구조화 데이터로도 밝힌다. 원문 크레딧은 신뢰·정책 준수·GEO 세 가지에 다 걸린다.
    citation: post.sources.map((s) => ({
      '@type': 'CreativeWork',
      name: s.title,
      url: s.url,
      provider: { '@type': 'Organization', name: s.origin },
    })),
    isBasedOn: post.originUrl || undefined,
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['.article-header h1', '.oneliner'],
    },
  };

  const breadcrumb = breadcrumbJsonLd([
    { name: site.name, url: `${site.url}/` },
    { name: post.category, url: `${site.url}/category/${encodeURIComponent(post.category)}/` },
    { name: post.title, url: pageUrl },
  ]);

  return (
    <article className="narrow" style={{ ['--chip-color' as string]: color }}>
      {/*
        JSON-LD 는 <script> 안에 그대로 들어가므로, 제목이나 출처에 "</script>" 같은
        문자열이 섞이면 태그가 조기 종료되면서 스크립트 주입이 된다. 원문 제목은 외부에서
        오는 값이라 실제로 가능한 경로다. <, >, & 를 유니코드 이스케이프로 바꿔 막는다.
        (본문 HTML 은 renderMarkdown 안에서 sanitize-html 로 이미 정화된다.)
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLd(breadcrumb) }}
      />

      <header className="article-header">
        <div className="meta-row">
          <Link href={`/category/${encodeURIComponent(post.category)}/`} className="chip">
            {post.category}
          </Link>
          <time className="meta" dateTime={post.date}>
            {formatDateTime(post.date)}
          </time>
          <span className="meta meta-sep">·</span>
          <LiveTime iso={post.date} className="meta" />
        </div>

        <h1>{post.title}</h1>

        <div className="byline">
          <strong>{post.desk}</strong>
          <span className="meta-sep">·</span>
          <span>{post.readingMinutes}분 읽기</span>
          <span className="meta-sep">·</span>
          <span>출처 {post.sources.length}곳 확인</span>
        </div>
      </header>

      {post.oneLiner && (
        <div className="oneliner">
          <span className="label">한 줄 요약</span>
          {post.oneLiner}
        </div>
      )}

      <AdSlot slot="top" />

      <div className="prose" dangerouslySetInnerHTML={{ __html: first }} />

      {rest && (
        <>
          <AdSlot slot="inArticle" />
          <div className="prose" dangerouslySetInnerHTML={{ __html: rest }} />
        </>
      )}

      {post.tags.length > 0 && (
        <div className="tag-row" style={{ margin: '2rem 0' }}>
          {post.tags.map((tag) => (
            <Link key={tag} className="tag" href={`/tag/${encodeURIComponent(tag)}/`}>
              #{tag}
            </Link>
          ))}
        </div>
      )}

      <section className="sources">
        <h2>이 기사의 출처</h2>
        <ul>
          {post.sources.map((s) => (
            <li key={s.url}>
              <span className="origin">{s.origin}</span>
              <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
        <p className="disclosure">
          이 글은 위 원문과 커뮤니티 반응을 바탕으로 AI의 도움을 받아 작성했으며, 발행 전 사람이
          확인합니다. 사실관계는 원문 링크에서 직접 확인하실 수 있습니다.
        </p>
      </section>

      {related.length > 0 && (
        <section className="related">
          <h2>함께 보면 좋은 글</h2>
          <ul>
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={`/posts/${r.slug}/`}>{r.title}</Link>
                <div className="meta" style={{ marginTop: '0.2rem' }}>
                  {r.category} · <LiveTime iso={r.date} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AdSlot slot="bottom" />
    </article>
  );
}
