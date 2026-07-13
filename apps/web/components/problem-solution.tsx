import { Ban, Coins, Puzzle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  SectionHeading,
} from "@bcns/ui";

const problems = [
  {
    icon: Ban,
    problem: "No software exists for it",
    solution:
      "That one part of your operation still runs on a whiteboard, a group text, or a spreadsheet nobody trusts. We build the tool that should exist — scoped to exactly that job.",
  },
  {
    icon: Coins,
    problem: "The software that exists is too expensive",
    solution:
      "Enterprise platforms charge per-seat for features you'll never use. We build a focused app you own outright, so your only ongoing cost is hosting and a domain.",
  },
  {
    icon: Puzzle,
    problem: "Off-the-shelf tools don't fit",
    solution:
      "Generic SaaS forces your business to work its way. We start from your workflow and build software that matches it — including the messy, specific parts.",
  },
];

export function ProblemSolution() {
  return (
    <section id="problems" className="border-t border-border/60 py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="The gap we fill"
          title="Three reasons the right software isn't already running your business"
          description="Most small businesses hit at least one of these. We're built for all three."
        />

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {problems.map(({ icon: Icon, problem, solution }) => (
            <Card key={problem} className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <span className="mb-2 flex size-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-5" aria-hidden />
                </span>
                <CardTitle>{problem}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed">
                  {solution}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
