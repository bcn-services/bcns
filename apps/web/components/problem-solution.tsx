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
import { siteContent } from "@/lib/content";

const problemIcons = [Ban, Coins, Puzzle] as const;

export function ProblemSolution() {
  const { eyebrow, title, description, items } = siteContent.problemSolution;

  return (
    <section id="problems" className="border-t border-border/60 py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {items.map(({ problem, solution }, index) => {
            const Icon = problemIcons[index];
            if (!Icon) return null;
            return (
              <Card key={index} className="h-full transition-shadow hover:shadow-md">
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
            );
          })}
        </div>
      </Container>
    </section>
  );
}
