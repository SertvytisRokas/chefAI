import Link from 'next/link';
import FoodWasteCounters from '../components/FoodWasteCounters';
import BlogCarousel from '../components/BlogCarousel';

const BLOG_PLACEHOLDERS = [
  {
    slug: 'scale-of-global-food-waste',
    title: 'The scale of global food waste',
    excerpt:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.',
    hue: 145,
  },
  {
    slug: 'household-habits-that-help',
    title: 'Household habits that help',
    excerpt:
      'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo.',
    hue: 155,
  },
  {
    slug: 'why-expiry-dates-matter',
    title: 'Why expiry dates matter',
    excerpt:
      'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla.',
    hue: 130,
  },
  {
    slug: 'cooking-from-what-you-have',
    title: 'Cooking from what you have',
    excerpt:
      'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim.',
    hue: 165,
  },
  {
    slug: 'the-cost-of-throwing-away-food',
    title: 'The cost of throwing away food',
    excerpt:
      'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.',
    hue: 140,
  },
  {
    slug: 'small-changes-big-impact',
    title: 'Small changes, big impact',
    excerpt:
      'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur.',
    hue: 150,
  },
];

const FEATURES = [
  {
    title: 'Fridge inventory',
    text: 'Track quantities, units, and expiry dates so soon-to-spoil items surface before they hit the bin.',
  },
  {
    title: 'Recipe Genius',
    text: 'Generate a custom recipe on demand from whatever is in your fridge right now.',
  },
  {
    title: 'Weekly meal plans',
    text: 'Plan breakfast, lunch, and dinner for seven days, prioritising ingredients closest to expiring.',
  },
  {
    title: 'Deep personalization',
    text: 'Diet, allergens, likes and dislikes, religious and cultural rules, cuisines, portions, time, and budget.',
  },
  {
    title: 'Strict or suggest mode',
    text: 'Cook with only what you have, or allow small gaps and send missing items to your shopping list.',
  },
  {
    title: 'Shopping list',
    text: 'Collect missing ingredients from suggest-mode recipes and move purchased items into your fridge.',
  },
  {
    title: 'History & favourites',
    text: 'Save recipes, rate them, and keep favourites — your personal cookbook grows as you cook.',
  },
  {
    title: 'Adaptive assistant',
    text: 'Learns from your ratings and optional comments, spotting patterns in what you love so future recipes improve over time.',
  },
  {
    title: 'Expiry-first cooking',
    text: 'Plans and recipes surface ingredients about to expire first, so nothing gets forgotten at the back of the fridge.',
  },
];

/**
 * Public landing page — hero, food-waste awareness, blog previews,
 * features, and footer. All sections scroll on this single page.
 */
export default function HomePage() {
  return (
    <div className="landing">
      {/* Hero — exactly one viewport below the header */}
      <section className="landing-hero landing-screen">
        <div className="landing-hero-inner">
          <p className="landing-eyebrow">Reduce waste. Cook smarter.</p>
          <h1 className="landing-hero-title">
            Turn what&apos;s in your fridge into meals worth making
          </h1>
          <p className="landing-hero-sub">
            chefAI helps you cook from ingredients you already have — cutting
            waste, saving money, and making better use of every item before it
            expires.
          </p>
          <div className="landing-hero-actions">
            <Link href="/login?mode=signup" className="btn btn-landing-primary btn-lg">
              Get started free
            </Link>
            <a href="#the-problem" className="btn btn-landing-ghost btn-lg">
              Why it matters
            </a>
          </div>
        </div>
      </section>

      {/* Problem & live counters */}
      <section
        id="the-problem"
        className="landing-section landing-section-alt landing-problem-section"
      >
        <div className="landing-container landing-panel-inner">
          <h2 className="landing-section-title">Food waste is a crisis we can fix</h2>
          <p className="landing-section-lead landing-section-lead--compact">
            Roughly one-third of all food produced for human consumption is lost
            or wasted globally each year. That is enough to feed billions — while
            hundreds of millions still go hungry. Most household waste is
            preventable with better planning and smarter cooking.
          </p>
          <FoodWasteCounters />
        </div>
      </section>

      {/* Blog previews — one viewport */}
      <section id="articles" className="landing-section landing-screen landing-articles-section">
        <div className="landing-container landing-panel-inner">
          <h2 className="landing-section-title">Stories &amp; insights</h2>
          <p className="landing-section-lead landing-section-lead--compact">
            Articles on food waste, sustainable cooking, and practical tips for
            making the most of what you already have.
          </p>
          <BlogCarousel posts={BLOG_PLACEHOLDERS} />
          <div className="blog-read-more">
            <Link href="/blog" className="btn btn-landing-primary btn-lg">
              Read more
            </Link>
          </div>
        </div>
      </section>

      {/* Features / main sell */}
      <section
        id="how-it-works"
        className="landing-section landing-section-alt landing-features-section"
      >
        <div className="landing-container landing-panel-inner">
          <h2 className="landing-section-title">Everything you need to waste less</h2>
          <p className="landing-section-lead landing-section-lead--compact">
            chefAI is built around your real kitchen — your ingredients, your
            constraints, and your schedule.
          </p>
          <div className="features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="feature-card">
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="landing-cta">
        <div className="landing-container landing-cta-inner">
          <h2>Ready to waste less food?</h2>
          <p>
            Join chefAI and start cooking from what you already have — no extra
            trips to the store required.
          </p>
          <Link href="/login?mode=signup" className="btn btn-landing-primary btn-lg">
            Get started
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-container landing-footer-bar">
          <div className="footer-brand-block">
            <p className="footer-brand">
              chef<span className="landing-logo-accent">AI</span>
            </p>
            <p className="footer-tagline">Less waste, more meals.</p>
          </div>
          <nav className="footer-links" aria-label="Footer">
            <Link href="/blog">Articles &amp; insights</Link>
            <span className="footer-divider" aria-hidden="true" />
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Contact</a>
          </nav>
          <p className="footer-copy">&copy; {new Date().getFullYear()} chefAI</p>
        </div>
      </footer>
    </div>
  );
}
