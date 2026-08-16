import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";

export function Terms() {
  return (
    <Layout>
      <SEO
        title="Terms and Conditions"
        description="Read MatchRV's Terms and Conditions to understand your rights and responsibilities when using the RV marketplace platform."
        canonical="https://matchrv.com/terms-and-conditions"
      />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-display font-bold mb-2">Terms and Conditions</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: May 16, 2026</p>

        <div className="space-y-8 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Acceptance of Terms and Conditions</h2>
            <p>
              By accessing or using RV Marketplace, you agree to be bound by these Terms and Conditions. If you do not agree, please do not use the site.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Use of the Platform</h2>
            <p>
              RV Marketplace provides a platform for buying and selling recreational vehicles. You agree to use the platform only for lawful purposes and in accordance with these terms. You may not post false, misleading, or fraudulent listings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Listings and Transactions</h2>
            <p>
              RV Marketplace is not a party to any transaction between buyers and sellers. We do not guarantee the accuracy of listings. All sales are between private parties, and buyers should independently verify vehicle condition, title, and any other relevant information before purchasing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. SMS Communications</h2>
            <p className="mb-3">
              By opting in to SMS communications, you consent to receive text messages from MatchRV regarding your account, saved listings, price drop alerts, and match report updates. You may provide this consent in one of two ways:
            </p>
            <ul className="list-disc pl-5 space-y-1 mb-3">
              <li>By checking the labeled SMS consent checkbox on the AI Outfitter quiz form at the time you submit your information.</li>
              <li>By creating a MatchRV account, where your consent to receive SMS communications is acknowledged during registration.</li>
            </ul>
            <p className="mb-3">
              Upon opting in, you will receive a confirmation text message. Message and data rates may apply. Message frequency varies.
            </p>
            <p>
              You may withdraw your consent and opt out of SMS communications at any time by replying <strong>STOP</strong> to any text message sent by MatchRV. You will receive a final confirmation message and no further SMS messages will be sent. Opting out of SMS does not affect your ability to use the platform or receive email communications.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Intellectual Property</h2>
            <p>
              All content on RV Marketplace — including the AI deal scoring, design, and software — is the property of RV Marketplace and may not be reproduced without written permission.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Disclaimer of Warranties</h2>
            <p>
              RV Marketplace is provided "as is" without warranties of any kind. We do not guarantee the accuracy of deal scores, market estimates, or listing information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, RV Marketplace shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Changes to Terms</h2>
            <p>
              We may update these Terms at any time. Continued use of the platform after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Contact</h2>
            <p>
              Questions about these Terms? Contact us at{" "}
              <a href="mailto:legal@rvmarketplace.com" className="text-primary underline">
                legal@rvmarketplace.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
