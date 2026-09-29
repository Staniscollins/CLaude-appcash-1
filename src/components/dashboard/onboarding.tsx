"use client";

import { ChartLine, FileUp, HandCoins, LoaderCircle, Plus, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { LogoMark } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLoadDemo } from "@/hooks/use-demo";
import { useUiStore } from "@/lib/ui-store";

const FEATURES = [
  {
    icon: Wallet,
    title: "Tout votre portefeuille",
    text: "PEA, compte-titres, crypto : positions, PRU et plus-values en temps réel, multi-devises.",
  },
  { icon: ChartLine, title: "Performance honnête", text: "TWR, TRI, volatilité, drawdown et comparaison au MSCI World, S&P 500, CAC 40…" },
  { icon: HandCoins, title: "Dividendes automatiques", text: "Détection des dividendes versés, calendrier et projection de vos revenus." },
  { icon: ShieldCheck, title: "Vos données restent chez vous", text: "Stockage local dans votre navigateur, export et import en un clic." },
];

export function Onboarding() {
  const { load, loading } = useLoadDemo();
  const openTransaction = useUiStore((s) => s.openTransaction);
  const setImportOpen = useUiStore((s) => s.setImportOpen);
  return (
    <div className="mx-auto max-w-5xl py-6 sm:py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 24 }}
        className="text-center"
      >
        <motion.div
          initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 14, delay: 0.1 }}
          className="mx-auto mb-6 w-fit rounded-[22px] shadow-[0_20px_60px_-10px_var(--accent-glow)]"
        >
          <LogoMark size={72} />
        </motion.div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
          Votre patrimoine boursier,
          <br />
          <span className="bg-linear-to-r from-[#a397ff] via-[#8b7dff] to-[#3987e5] bg-clip-text text-transparent">en pleine lumière.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-balance text-muted">
          Suivez vos positions, analysez votre performance face aux indices et anticipez vos dividendes — dans une interface pensée pour
          être un plaisir.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button variant="primary" size="lg" onClick={() => void load()} disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            Explorer avec un portefeuille de démo
          </Button>
          <Button variant="secondary" size="lg" onClick={() => openTransaction()}>
            <Plus /> Ajouter ma première opération
          </Button>
          <Button variant="ghost" size="lg" onClick={() => setImportOpen(true)}>
            <FileUp /> Importer un CSV
          </Button>
        </div>
      </motion.div>

      <motion.div
        className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.25 } } }}
      >
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <Card key={f.title} className="p-5">
              <span className="mb-4 grid size-10 place-items-center rounded-xl bg-accent-soft text-accent ring-1 ring-accent/20">
                <Icon className="size-5" />
              </span>
              <h3 className="font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
            </Card>
          );
        })}
      </motion.div>
    </div>
  );
}
