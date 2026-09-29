"use client";

import { Newspaper } from "lucide-react";
import { AllocationCard } from "@/components/dashboard/allocation-card";
import { EventsCard } from "@/components/dashboard/events-card";
import { HeroCard } from "@/components/dashboard/hero-card";
import { HoldingsPreview } from "@/components/dashboard/holdings-preview";
import { KpiTiles } from "@/components/dashboard/kpis";
import { MarketTicker } from "@/components/dashboard/market-ticker";
import { MoversCard } from "@/components/dashboard/movers-card";
import { Onboarding } from "@/components/dashboard/onboarding";
import { NewsList } from "@/components/news/news-list";
import { usePortfolio } from "@/components/portfolio/portfolio-provider";
import { Card, CardHeader, Stagger } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/primitives";

export default function DashboardPage() {
  const { hydrated, isEmpty, snapshot } = usePortfolio();

  if (!hydrated) {
    return (
      <div className="grid gap-4 lg:grid-cols-12">
        <Skeleton className="h-[460px] rounded-[var(--radius-card)] lg:col-span-8" />
        <Skeleton className="h-[460px] rounded-[var(--radius-card)] lg:col-span-4" />
      </div>
    );
  }
  if (isEmpty) return <Onboarding />;

  return (
    <>
      <MarketTicker />
      <Stagger className="grid gap-4 lg:grid-cols-12">
        <HeroCard className="lg:col-span-8" />
        <KpiTiles className="lg:col-span-4" />
        <AllocationCard className="lg:col-span-5" />
        <MoversCard className="lg:col-span-4" />
        <EventsCard className="lg:col-span-3" />
        <HoldingsPreview className="lg:col-span-12" />
        <Card className="lg:col-span-12">
          <CardHeader title="Actualités de vos valeurs" subtitle="Sélection Yahoo Finance" icon={<Newspaper className="size-4" />} />
          <NewsList symbols={snapshot.positions.slice(0, 10).map((p) => p.symbol)} limit={6} columns={3} />
        </Card>
      </Stagger>
    </>
  );
}
