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
  const { eyebrow, title, description, cardTitleBio, cardTitleCredentials, bio, credentials } = siteContent.aboutFounder;

  return (
    <section id="about" className="border-t border-border/60 py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{cardTitleBio}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-base leading-relaxed">{bio}</CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{cardTitleCredentials}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {credentials.map((credential, index) => (
                  <li key={index} className="text-sm text-muted-foreground">
                    {credential}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </Container>
    </section>
  );
}
