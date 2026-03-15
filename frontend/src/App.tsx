import { useState, useEffect, useCallback } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "";

interface Paper {
  arxiv_id: string;
  title: string;
  abstract: string;
  authors: string[];
  categories: string[];
  tags: string[];
  published_at: string;
  updated_at: string;
  arxiv_url: string;
  pdf_url: string;
  summary: string;
  why_it_matters: string;
  tier: "hot" | "warm" | "cold";
  trending_score: number;
  citation_count: number;
  influential_citation_count: number;
  reference_count: number;
  hf_upvotes: number;
  hf_comments: number;
  github_stars: number;
  github_url: string;
  ingested_at: string;
}

interface ApiResponse {
  data: Paper[];
  meta: { count: number; nextToken?: string };
}

interface TagCount {
  tag: string;
  count: number;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  const days = Math.floor(seconds / 86400);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function scoreClass(score: number): string {
  if (score >= 0.3) return "paper-score";
  if (score >= 0.05) return "paper-score warm";
  return "paper-score cold";
}

function parseSummary(raw: string): { summary: string; why: string } {
  // Strip markdown code fences if present
  let cleaned = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  // Try to parse as JSON
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.summary) return { summary: parsed.summary, why: parsed.why_it_matters || "" };
  } catch {
    // Try to extract JSON from truncated responses
    const match = cleaned.match(/"summary"\s*:\s*"([^"]+)"/);
    if (match) {
      const whyMatch = cleaned.match(/"why_it_matters"\s*:\s*"([^"]+)"/);
      return { summary: match[1], why: whyMatch?.[1] || "" };
    }
  }
  return { summary: cleaned, why: "" };
}

function PaperCard({ paper }: { paper: Paper }) {
  const { summary, why } = parseSummary(paper.summary);
  const displayWhy = why || paper.why_it_matters;
  const upvotes = paper.hf_upvotes ?? 0;
  const comments = paper.hf_comments ?? 0;
  const stars = paper.github_stars ?? 0;
  const citations = paper.citation_count ?? 0;
  const hasPopularity = upvotes > 0 || stars > 0 || citations > 0;

  return (
    <article className="paper-card">
      <div className="paper-header">
        <h2 className="paper-title">
          <a href={paper.arxiv_url} target="_blank" rel="noopener noreferrer">
            {paper.title}
          </a>
        </h2>
        <span className={scoreClass(paper.trending_score)}>
          {paper.trending_score.toFixed(2)}
        </span>
      </div>
      <div className="paper-meta">
        <span>{paper.authors.slice(0, 3).join(", ")}{paper.authors.length > 3 ? ` +${paper.authors.length - 3}` : ""}</span>
        <span className="dot">&middot;</span>
        <span>{timeAgo(paper.published_at)}</span>
      </div>
      {hasPopularity && (
        <div className="paper-popularity">
          {upvotes > 0 && (
            <span className="pop-badge upvotes" title="HuggingFace upvotes">
              &#9650; {upvotes}
            </span>
          )}
          {comments > 0 && (
            <span className="pop-badge comments" title="HuggingFace comments">
              &#128172; {comments}
            </span>
          )}
          {stars > 0 && (
            paper.github_url ? (
              <a href={paper.github_url} target="_blank" rel="noopener noreferrer" className="pop-badge github" title="GitHub stars">
                &#9733; {stars}
              </a>
            ) : (
              <span className="pop-badge github" title="GitHub stars">
                &#9733; {stars}
              </span>
            )
          )}
          {citations > 0 && (
            <span className="pop-badge citations" title="Citations">
              {citations} cited
            </span>
          )}
        </div>
      )}
      {summary && <p className="paper-summary">{summary}</p>}
      {displayWhy && <p className="paper-why">{displayWhy}</p>}
      <div className="paper-tags">
        {paper.tags.map((tag) => (
          <span key={tag} className="tag">{tag}</span>
        ))}
      </div>
      <div className="paper-links">
        <a href={paper.arxiv_url} target="_blank" rel="noopener noreferrer">
          arXiv
        </a>
        <a href={paper.pdf_url} target="_blank" rel="noopener noreferrer">
          PDF
        </a>
      </div>
    </article>
  );
}

export default function App() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"trending" | "latest">("trending");

  const fetchPapers = useCallback(
    async (token?: string | null) => {
      const isMore = !!token;
      if (isMore) setLoadingMore(true);
      else setLoading(true);

      try {
        const endpoint = view === "trending" ? "/papers/trending" : "/papers";
        const params = new URLSearchParams();
        if (token) params.set("nextToken", token);
        if (activeTag) params.set("tag", activeTag);
        const qs = params.toString();
        const url = `${API_URL}${endpoint}${qs ? "?" + qs : ""}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data: ApiResponse = await res.json();

        if (isMore) {
          setPapers((prev) => [...prev, ...data.data]);
        } else {
          setPapers(data.data);
        }
        setNextToken(data.meta.nextToken ?? null);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load papers");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [view, activeTag]
  );

  useEffect(() => {
    fetchPapers();
  }, [fetchPapers]);

  useEffect(() => {
    fetch(`${API_URL}/tags`)
      .then((r) => r.json())
      .then((data) => setTags(data.data ?? []))
      .catch(() => {});
  }, []);

  const handleTagClick = (tag: string) => {
    setActiveTag((prev) => (prev === tag ? null : tag));
  };

  return (
    <div className="app">
      <header className="header">
        <h1>ArXiv Trending Papers</h1>
        <p className="header-sub">
          Trending AI/ML papers from arXiv, summarized daily
        </p>
        <div className="header-links">
          <a href={`${API_URL}/rss`} target="_blank" rel="noopener noreferrer">
            RSS Feed
          </a>
        </div>
      </header>

      <div className="filters">
        <button
          className={`filter-btn ${view === "trending" && !activeTag ? "active" : ""}`}
          onClick={() => { setView("trending"); setActiveTag(null); }}
        >
          Trending
        </button>
        <button
          className={`filter-btn ${view === "latest" && !activeTag ? "active" : ""}`}
          onClick={() => { setView("latest"); setActiveTag(null); }}
        >
          Latest
        </button>
        {tags.map(({ tag, count }) => (
          <button
            key={tag}
            className={`filter-btn ${activeTag === tag ? "active" : ""}`}
            onClick={() => handleTagClick(tag)}
          >
            {tag} ({count})
          </button>
        ))}
      </div>

      <div className="stats">
        <span>{papers.length} papers loaded</span>
      </div>

      {loading && <div className="loading">Loading papers...</div>}
      {error && <div className="error">{error}</div>}

      {!loading &&
        !error &&
        papers.map((paper) => (
          <PaperCard key={paper.arxiv_id} paper={paper} />
        ))}

      {!loading && !error && nextToken && (
        <button
          className="load-more"
          onClick={() => fetchPapers(nextToken)}
          disabled={loadingMore}
        >
          {loadingMore ? "Loading..." : "Load more"}
        </button>
      )}

      {!loading && !error && papers.length === 0 && (
        <div className="loading">No papers found</div>
      )}
    </div>
  );
}
