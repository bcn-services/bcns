import { Cloud, MonitorDown, Globe } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  SectionHeading,
} from "@acme-labs/ui";

const models = [
  {
    icon: Cloud,
    title: "Hosted in your own account",
    description:
      "We deploy to infrastructure you own (your Vercel, your cloud, your domain). You hold the keys and the bill — we just build and maintain what runs on it.",
  },
  {
    icon: MonitorDown,
    title: "Downloadable desktop app",
    description:
      "For tools that live on the counter or the back-office machine, we can ship a real desktop app that runs locally — no monthly login, no internet dependency.",
  },
  {
    icon: Globe,
    title: "Installable web app",
    description:
      "A fast web app your team opens in the browser and can install to the home screen on phones and tablets. Works great for staff who are always on the move.",
  },
];

export function DeliveryModels() {
  return (
    <section id="delivery" className="border-t border-border/60 py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Delivery & ownership"
          title="Your software, delivered the way that fits your business"
          description="However we ship it, you own it. The point is flexibility — not lock-in."
        />

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {models.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="h-full bg-gradient-to-b from-card to-muted/30">
              <CardHeader>
                <span className="mb-2 flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed">
                  {description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
