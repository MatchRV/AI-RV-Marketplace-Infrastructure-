import { useState } from "react";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { Button, Input } from "@/components/ui-elements";
import { Mail, Check } from "lucide-react";

export function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });

  const update = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const r = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error("Failed to send message. Please try again.");
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-3xl font-display font-bold mb-3">Message Sent!</h1>
          <p className="text-muted-foreground max-w-md">
            Thank you for reaching out. We'll get back to you within 1-2 business days.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <SEO
        title="Contact Us — Get Help with Your RV Search"
        description="Have a question about MatchRV or an RV listing? Reach out to our team. We're here to help you find, buy, or sell the perfect RV."
        canonical="https://matchrv.com/contact"
      />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-display font-bold mb-3">Contact Us</h1>
          <p className="text-lg text-muted-foreground">
            Have a question? We'd love to hear from you.
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Name *</label>
              <Input placeholder="Your name" value={form.name} onChange={(e) => update("name", e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Email *</label>
              <Input type="email" placeholder="you@example.com" value={form.email} onChange={(e) => update("email", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Subject *</label>
            <Input placeholder="What's this about?" value={form.subject} onChange={(e) => update("subject", e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Message *</label>
            <textarea
              className="w-full min-h-[150px] rounded-lg border-2 border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary resize-y"
              placeholder="Tell us what's on your mind..."
              value={form.message}
              onChange={(e) => update("message", e.target.value)}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button
            className="w-full"
            disabled={!form.name || !form.email || !form.subject || !form.message || isSubmitting}
            onClick={handleSubmit}
          >
            {isSubmitting ? "Sending..." : "Send Message"}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
