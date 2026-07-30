import Image, { type StaticImageData } from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  SectionHeading,
} from "@nseluga/ui";
import { SectionAtmosphere } from "@/components/section-atmosphere";
import { Reveal } from "@/components/reveal";
import { siteContent } from "@/lib/content";
import nateSeluga from "@/public/founders/nate-seluga.jpg";

/**
 * `founders[].photo` in the registry is a path string; next/image needs a static
 * import to get intrinsic dimensions and to turn a deleted file into a build
 * error. Same mechanism and reasoning as lib/case-study-images.ts, kept local
 * because `founders` is a fixed tuple of two. A founder with no `photo` — or a
 * `photo` with no entry here — falls back to initials rather than a broken image.
 */
const FOUNDER_PHOTOS: Record<string, StaticImageData> = {
  "/founders/nate-seluga.jpg": nateSeluga,
};

export function AboutFounder() {
  const { eyebrow, title, description, founders, whyBcns } = siteContent.about;

  return (
    <section id="about" className="relative overflow-hidden border-t border-border/60 pt-16 pb-24 sm:pt-20 sm:pb-28">
      <SectionAtmosphere variant="about" />
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          accent="people"
          description={description}
        />

        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          {founders.map((founder, index) => {
            const initials = founder.name.split(" ").map((w: string) => w[0]).join("");
            const photo = founder.photo ? FOUNDER_PHOTOS[founder.photo] : undefined;
            return (
            <Reveal as="div" key={founder.name} variant="pop" delay={index * 140} className="h-full">
            <Card className="group hover-lift relative h-full overflow-hidden">
              <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-primary/40 transition-colors duration-300 group-hover:bg-primary" aria-hidden />
              <CardHeader className="pl-8">
                <div className="flex items-center gap-4 mb-2">
                  {photo ? (
                    /* Decorative: the name is already adjacent in CardTitle, so
                       alt text would only repeat it to a screen reader. */
                    <Image
                      src={photo}
                      alt=""
                      sizes="56px"
                      className="size-14 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-accent/60 text-foreground font-bold text-lg select-none"
                    >
                      {initials}
                    </div>
                  )}
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
            </Reveal>
            );
          })}
        </div>

        {whyBcns && (
          <Reveal className="mx-auto mt-16 max-w-3xl">
            <blockquote className="relative rounded-2xl border-l-2 border-primary bg-secondary/40 px-10 py-8 pt-10 text-center">
              {/* Large opening mark — serif accent, low opacity, behind the text. */}
              <span
                aria-hidden
                className="pointer-events-none absolute left-5 top-1 select-none font-serif-accent text-7xl italic leading-none text-primary/25"
              >
                &ldquo;
              </span>
              <p className="relative text-pretty text-xl font-medium leading-relaxed text-foreground/90 sm:text-2xl">
                {whyBcns}
              </p>
            </blockquote>
          </Reveal>
        )}
      </Container>
    </section>
  );
}
