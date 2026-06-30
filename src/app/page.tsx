import Link from 'next/link';
import FoodWasteCounters from '../components/FoodWasteCounters';

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

/**
 * Public landing page — hero, food-waste awareness, blog previews,
 * how-it-works, and footer. All sections scroll on this single page.
 */
export default function HomePage() {
  return (
    <div className="landing">
      {/* Hero */}
      <section className="landing-hero">
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
              Learn why it matters
            </a>
          </div>
        </div>
      </section>

      {/* Problem & live counters */}
      <section id="the-problem" className="landing-section landing-section-alt">
        <div className="landing-container">
          <h2 className="landing-section-title">Food waste is a crisis we can fix</h2>
          <p className="landing-section-lead">
            Roughly one-third of all food produced for human consumption is lost
            or wasted globally each year. That is enough to feed billions — while
            hundreds of millions still go hungry. Most household waste is
            preventable with better planning and smarter cooking.
          </p>
          <FoodWasteCounters />
          <p className="landing-source-note">
            Live counters are illustrative projections based on published annual
            estimates. Sources:{' '}
            <a
              href="https://www.unep.org/resources/report/food-waste-index-report-2021"
              target="_blank"
              rel="noopener noreferrer"
            >
              UNEP Food Waste Index 2021
            </a>
            ,{' '}
            <a
              href="https://www.fao.org/publications/sofi/2023/en"
              target="_blank"
              rel="noopener noreferrer"
            >
              FAO SOFI 2023
            </a>
            .
          </p>
        </div>
      </section>

      {/* Blog previews */}
      <section id="articles" className="landing-section">
        <div className="landing-container">
          <h2 className="landing-section-title">Stories &amp; insights</h2>
          <p className="landing-section-lead">
            Articles on food waste, sustainable cooking, and practical tips for
            making the most of what you already have.
          </p>
          <div className="blog-grid">
            {BLOG_PLACEHOLDERS.map((post) => (
              <a
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="blog-card"
              >
                <div
                  className="blog-card-image"
                  style={{
                    background: `linear-gradient(135deg, hsl(${post.hue} 35% 22%) 0%, hsl(${post.hue} 25% 12%) 100%)`,
                  }}
                />
                <div className="blog-card-body">
                  <h3 className="blog-card-title">{post.title}</h3>
                  <p className="blog-card-excerpt">{post.excerpt}</p>
                </div>
              </a>
            ))}
          </div>
          <div className="blog-read-more">
            <Link href="/blog" className="btn btn-landing-primary btn-lg">
              Read more articles
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="landing-section landing-section-alt">
        <div className="landing-container">
          <h2 className="landing-section-title">How chefAI works</h2>
          <p className="landing-section-lead">
            Three simple steps between a full fridge and less waste on your plate.
          </p>
          <div className="steps-grid">
            <div className="step-card">
              <span className="step-number">01</span>
              <h3>Track your fridge</h3>
              <p>
                Add what you have — quantities, units, and expiry dates — so
                nothing slips through unnoticed.
              </p>
            </div>
            <div className="step-card">
              <span className="step-number">02</span>
              <h3>Get tailored recipes</h3>
              <p>
                AI generates meals from your actual ingredients, respecting your
                diet, allergens, and tastes.
              </p>
            </div>
            <div className="step-card">
              <span className="step-number">03</span>
              <h3>Waste less, save more</h3>
              <p>
                Cook what&apos;s about to expire first, build shopping lists only
                for real gaps, and keep food out of the bin.
              </p>
            </div>
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
            Create your free account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-container landing-footer-grid">
          <div className="footer-col">
            <p className="footer-brand">
              chef<span className="landing-logo-accent">AI</span>
            </p>
            <p className="footer-tagline">
              Smart cooking from your fridge. Less waste, more meals.
            </p>
          </div>
          <div className="footer-col">
            <p className="footer-heading">Product</p>
            <a href="#how-it-works">How it works</a>
            <a href="/login?mode=signup">Sign up</a>
            <a href="/login">Log in</a>
          </div>
          <div className="footer-col">
            <p className="footer-heading">Resources</p>
            <a href="#articles">Articles</a>
            <Link href="/blog">Blog library</Link>
            <a href="#the-problem">Food waste facts</a>
          </div>
          <div className="footer-col">
            <p className="footer-heading">Legal</p>
            <a href="#">Privacy policy</a>
            <a href="#">Terms of service</a>
            <a href="#">Contact</a>
          </div>
        </div>
        <div className="landing-container landing-footer-bottom">
          <p>&copy; {new Date().getFullYear()} chefAI. All rights reserved.</p>
          <div className="footer-social">
            <a href="#" aria-label="Twitter / X">X</a>
            <a href="#" aria-label="Instagram">Instagram</a>
            <a href="#" aria-label="LinkedIn">LinkedIn</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
