import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ElasticQuest - Elasticsearch Benchmark for AI Models',
  description:
    'How well does your AI model know Elasticsearch? 53 challenges across 6 domains. Benchmark any LLM and compare on the public leaderboard.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <div className="nav-inner">
            <a href="/" className="logo">
              <span className="logo-icon">&#9889;</span> ElasticQuest
            </a>
            <div className="nav-links">
              <a href="/leaderboard">Leaderboard</a>
              <a href="/challenges">Challenges</a>
              <a href="/insights">Insights</a>
              <a href="/scoring">Scoring</a>
              <a
                href="https://github.com/bahaaldine/elasticquest"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </div>
          </div>
        </nav>
        <main>{children}</main>
        <footer className="footer">
          <p>ElasticQuest - Open source Elasticsearch benchmark for AI models</p>
        </footer>
      </body>
    </html>
  );
}
