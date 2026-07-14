import { Cloud, MonitorDown, Globe } from "lucide-react";
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

const deliveryIcons = [Cloud, MonitorDown, Globe] as const;

export function DeliveryModels() {
  const { eyebrow, title, description, items } = siteContent.deliveryModels;

  return (
    <section id="delivery" className="border-t border-border/60 py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {items.map(({ title: modelTitle, description: modelDescription }, index) => {
            const Icon = deliveryIcons[index]!;
            return (
              <Card key={modelTitle} className="h-full bg-gradient-to-b from-card to-muted/30">
                <CardHeader>
                  <span className="mb-2 flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <CardTitle>{modelTitle}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base leading-relaxed">
                    {modelDescription}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
