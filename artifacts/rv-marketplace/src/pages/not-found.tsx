import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { Button } from "@/components/ui-elements";
import { Map } from "lucide-react";

export default function NotFound() {
  return (
    <Layout>
      <SEO title="Page Not Found" noIndex />
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-background min-h-[60vh]">
        <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6 border-4 border-background shadow-xl">
          <Map className="w-12 h-12 text-muted-foreground" />
        </div>
        <h1 className="text-4xl font-display font-bold mb-4">Off the Map</h1>
        <p className="text-lg text-muted-foreground max-w-md mb-8">
          Looks like you've driven a bit too far off the trail. We can't find the page you're looking for.
        </p>
        <Link href="/">
          <Button size="lg" className="px-8">
            Return to Basecamp
          </Button>
        </Link>
      </div>
    </Layout>
  );
}
