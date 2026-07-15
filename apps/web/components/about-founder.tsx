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
    <section id="about" className="border-t border-border/60 pt-16 pb-24 sm:pt-20 sm:pb-28">
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
                <CardTitle className="text-xl">{founder.name}</CardTitle>
                <p className="text-sm font-medium text-primary/80">{founder.roleLine}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <CardDescription className="text-base leading-relaxed">
                  {founder.bio}
                </CardDescription>
                <ul className="space-y-1.5 border-t border-border/60 pt-4">
                  {founder.credentials.map((credential, credIndex) => (
                    <li key={credIndex} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/50" aria-hidden />
                      {credential}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        {whyBcns && (
          <p className="mx-auto mt-14 max-w-2xl text-center text-lg leading-relaxed text-muted-foreground">
            {whyBcns}
          </p>
        )}
      </Container>
    </section>
  );
}
