import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";

export function Terms() {
  return (
    <Layout>
      <SEO
        title="Terms and Conditions"
        description="Read MatchRV's Terms and Conditions to understand your rights and responsibilities when using the RV marketplace platform."
        canonical="/terms-and-conditions"
      />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-display font-bold mb-2">Terms and Conditions</h1>
        <p className="text-sm text-muted-foreground mb-4">Last updated: September 25, 2026</p>\n        <p className="text-muted-foreground mb-10">These Terms govern services provided by MatchRV Inc. (&quot;MatchRV&quot;), including the MatchRV website and supported AI/plugin experiences.</p>

        <div className="space-y-8 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Acceptance of Terms and Conditions</h2>
            <p>
              By accessing or using MatchRV, you agree to be bound by these Terms and Conditions. If you do not agree, please do not use the site.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Use of the Platform</h2>
            <p>
              MatchRV provides a platform for buying and selling recreational vehicles. You agree to use the platform only for lawful purposes and in accordance with these terms. You may not post false, misleading, or fraudulent listings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Listings and Transactions</h2>
            <p>
              MatchRV is not a party to any transaction between buyers and sellers. We do not guarantee the accuracy of listings. Transactions may involve independent dealerships, sellers, lenders, transport providers, or other third parties. Buyers should independently verify vehicle condition, title, pricing, availability, specifications, and any other relevant information before purchasing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. AI-Assisted Shopping and Towing</h2>
            <p>
              MatchRV may be accessed through supported AI assistants and plugins. Search, comparison, and tow-fit outputs are provided for shopping and planning purposes only. Missing or unverified specifications remain unknown, and MatchRV does not guarantee towing safety or compatibility from a generic vehicle model, advertised maximum tow rating, or incomplete weight data. Always verify the exact vehicle configuration, payload label, hitch limits, loaded RV weight, tongue or pin weight, and manufacturer guidance before towing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Dealer Contact Authorization</h2>
            <p>
              MatchRV may prepare a dealer-contact request on your behalf. No dealer contact is submitted until you explicitly approve the previewed action. By approving submission, you authorize MatchRV to send the reviewed contact information, message, and relevant RV reference to the selected dealership so it can respond.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. SMS Communications</h2>
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
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Intellectual Property</h2>
            <p>
              All content on MatchRV — including the AI deal scoring, design, and software — is the property of MatchRV and may not be reproduced without written permission.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Disclaimer of Warranties</h2>
            <p>
              MatchRV is provided "as is" without warranties of any kind. We do not guarantee the accuracy, completeness, or continued availability of listing information, prices, specifications, market estimates, or third-party content. AI-assisted search and tow-fit outputs are informational and may rely on incomplete or changing source data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, MatchRV shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Changes to Terms</h2>
            <p>
              We may update these Terms at any time. Continued use of the platform after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">11. Contact</h2>
            <p>
              Questions about these Terms? Contact us at{" "}
              <a href="mailto:jonathan@matchrv.com" className="text-primary underline">
                jonathan@matchrv.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
