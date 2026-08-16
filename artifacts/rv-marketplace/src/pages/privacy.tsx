import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";

export function Privacy() {
  return (
    <Layout>
      <SEO
        title="Privacy Policy"
        description="Learn how MatchRV collects, uses, and protects your personal data when you use our AI-powered RV marketplace."
        canonical="https://matchrv.com/privacy"
      />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-display font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: May 16, 2026</p>

        <div className="space-y-8 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Information We Collect</h2>
            <p>
              We collect information you provide directly (name, email, phone number, listing details) and information collected automatically when you use the platform (page views, search queries, device type, and IP address).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. How We Use Your Information</h2>
            <p>
              We use the information we collect to operate and improve RV Marketplace, send you relevant listing alerts, provide AI-powered recommendations, and communicate with you about your account or submissions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. SMS Notifications</h2>
            <p className="mb-3">
              MatchRV may send you SMS text messages related to your account, saved listings, price alerts, and match reports. You may opt in to SMS notifications in one of two ways:
            </p>
            <ul className="list-disc pl-5 space-y-1 mb-3">
              <li>By checking the labeled SMS consent checkbox on the AI Outfitter quiz form when submitting your information.</li>
              <li>By creating a MatchRV account, where SMS consent is indicated during the registration process.</li>
            </ul>
            <p className="mb-3">
              Upon opting in, you will receive a confirmation text message. Message and data rates may apply. Message frequency varies based on your activity and preferences.
            </p>
            <p>
              You may opt out of SMS notifications at any time by replying <strong>STOP</strong> to any message you receive from us. After opting out, you will receive a final confirmation text and no further messages will be sent. To re-enable SMS notifications, contact us or update your account preferences.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Sharing of Information</h2>
            <p>
              We do not sell your personal information. We may share information with service providers who assist us in operating the platform, subject to confidentiality obligations. We may also disclose information when required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Cookies and Analytics</h2>
            <p>
              RV Marketplace uses cookies and similar tracking technologies to improve your experience and analyze site usage. You can control cookie settings through your browser preferences.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Data Retention</h2>
            <p>
              We retain your information for as long as necessary to provide our services or comply with legal obligations. You may request deletion of your data by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Security</h2>
            <p>
              We implement reasonable technical and organizational measures to protect your information. However, no transmission over the internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Your Rights</h2>
            <p>
              Depending on your location, you may have rights to access, correct, or delete your personal data. To exercise these rights, contact us at the address below.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Contact</h2>
            <p>
              Questions about this Privacy Policy? Contact us at{" "}
              <a href="mailto:privacy@rvmarketplace.com" className="text-primary underline">
                privacy@rvmarketplace.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
