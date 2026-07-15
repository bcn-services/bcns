import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  SectionHeading,
} from "@bcns/ui";
import { siteContent } from "@/lib/content";

export function AboutFounder() {
  const { eyebrow, title, description, founders, whyBcns } = siteContent.about;

  return (
    <section id="about" className="border-t border-border/60 py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          {founders.map((founder) => (
            <Card key={founder.name} className="h-full">
              <CardHeader>
                <CardTitle className="text-base">{founder.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{founder.roleLine}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <CardDescription className="text-base leading-relaxed">
                  {founder.bio}
                </CardDescription>
                <ul className="space-y-2">
                  {founder.credentials.map((credential, credIndex) => (
                    <li key={credIndex} className="text-sm text-muted-foreground">
                      {credential}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        {whyBcns && (
          <p className="mt-12 text-base leading-relaxed text-muted-foreground">
            {whyBcns}
          </p>
        )}
      </Container>
    </section>
  );
}
