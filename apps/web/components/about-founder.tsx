import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  SectionHeading,
} from "@nseluga/ui";
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
          {founders.map((founder) => {
            const initials = founder.name.split(" ").map((w: string) => w[0]).join("");
            return (
            <Card key={founder.name} className="relative h-full overflow-hidden">
              <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-primary/40" aria-hidden />
              <CardHeader className="pl-8">
                <div className="flex items-center gap-4 mb-2">
                  <div
                    aria-hidden
                    className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-accent/60 text-foreground font-bold text-lg select-none"
                  >
                    {initials}
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-bold">{founder.name}</CardTitle>
                    <p className="text-sm font-semibold uppercase tracking-wider text-primary/70">{founder.roleLine}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pl-8">
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
            );
          })}
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
