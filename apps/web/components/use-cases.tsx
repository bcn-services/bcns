import { CalendarClock, Boxes, LineChart, Wrench } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  SectionHeading,
} from "@acme-labs/ui";

// TODO: swap these placeholder examples for real case studies / screenshots
// once we've shipped a few client projects.
const useCases = [
  {
    icon: CalendarClock,
    tag: "Booking",
    title: "Appointment & job scheduling",
    description:
      "A booking flow that matches your real availability, deposits, and no-show rules — synced to the calendar your team already uses.",
  },
  {
    icon: Boxes,
    tag: "Inventory",
    title: "Stock & supply tracking",
    description:
      "Know what's on the shelf and what to reorder, with low-stock alerts and a scan-friendly interface built for the shop floor.",
  },
  {
    icon: LineChart,
    tag: "Dashboards",
    title: "Owner's dashboard",
    description:
      "One screen that pulls sales, jobs, and cash flow into numbers you actually check — instead of five tabs and a spreadsheet.",
  },
  {
    icon: Wrench,
    tag: "Internal tools",
    title: "Back-office workflows",
    description:
      "Quotes, invoices, intake forms, and approvals wired into one place, so the busywork stops living in inboxes and sticky notes.",
  },
];

export function UseCases() {
  return (
    <section id="examples" className="border-t border-border/60 bg-muted/40 py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Example use-cases"
          title="A sense of what we build"
          description="Starting points, not a menu — every project is scoped to your business."
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {useCases.map(({ icon: Icon, tag, title, description }) => (
            <Card key={title} className="group h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-transform group-hover:-translate-y-0.5">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {tag}
                  </span>
                </div>
                <CardTitle className="mt-3 text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="leading-relaxed">{description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
