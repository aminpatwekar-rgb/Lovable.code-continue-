import { useState, useEffect } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

const PHRASES = ["Setting things up…", "Loading your workspace…", "Preparing academic hub…"];

export function LoadingScreen({ className }: { className?: string }) {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % PHRASES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  const letters = ["O", "N", "Y", "X"];

  const wordmarkContainer: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: 0.15,
        staggerChildren: 0.08,
      },
    },
  };

  const letterItem: Variants = {
    hidden: { opacity: 0, y: 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 24,
      },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{
        opacity: 0,
        scale: 0.98,
        transition: { duration: 0.3, ease: "easeInOut" },
      }}
      className={cn(
        "fixed inset-0 z-50 flex min-h-screen w-full flex-col items-center justify-center bg-background px-4 select-none",
        className,
      )}
      aria-label="Loading ONYX"
      role="status"
    >
      {/* Subtle living ambient background veil */}
      <motion.div
        className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden"
        animate={{
          opacity: [0.3, 0.5, 0.3],
          scale: [0.96, 1.05, 0.96],
        }}
        transition={{
          duration: 4,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      >
        <div
          className="size-[380px] sm:size-[480px] rounded-full blur-3xl opacity-15"
          style={{
            background: "radial-gradient(circle, var(--primary) 0%, transparent 70%)",
          }}
        />
      </motion.div>

      <div className="relative flex flex-col items-center gap-6">
        {/* Animated Brand "O" mark with orbiting conic-gradient ring */}
        <div className="relative flex items-center justify-center">
          {/* Rotating conic ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{
              duration: 2.2,
              ease: "linear",
              repeat: Infinity,
            }}
            className="absolute -inset-2.5 rounded-2xl opacity-75 blur-[0.5px]"
            style={{
              background:
                "conic-gradient(from 0deg, var(--primary) 0deg, transparent 180deg, var(--primary) 360deg)",
            }}
          />

          {/* Orbiting micro-accent particle */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{
              duration: 2.2,
              ease: "linear",
              repeat: Infinity,
            }}
            className="absolute -inset-2.5 rounded-2xl flex items-start justify-center pointer-events-none"
          >
            <span className="size-2 rounded-full bg-primary shadow-[0_0_10px_var(--primary)] -translate-y-1" />
          </motion.div>

          {/* Center "O" Box */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              type: "spring",
              stiffness: 350,
              damping: 22,
            }}
            className="relative z-10 flex size-12 items-center justify-center rounded-xl bg-primary text-xl font-black text-primary-foreground shadow-md ring-2 ring-background"
          >
            O
          </motion.div>
        </div>

        {/* Wordmark "ONYX" letter-by-letter reveal */}
        <motion.div
          variants={wordmarkContainer}
          initial="hidden"
          animate="visible"
          className="flex items-center gap-1 text-2xl font-bold tracking-tight text-foreground"
        >
          {letters.map((char, index) => (
            <motion.span key={index} variants={letterItem}>
              {char}
            </motion.span>
          ))}
        </motion.div>

        {/* Indeterminate moving progress bar */}
        <div className="relative h-1 w-36 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="brand-gradient absolute inset-y-0 w-2/5 rounded-full"
            animate={{ x: ["-100%", "280%"] }}
            transition={{
              repeat: Infinity,
              duration: 1.4,
              ease: [0.4, 0, 0.2, 1],
            }}
          />
        </div>

        {/* Personality rotating status line */}
        <div className="h-5 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={phraseIndex}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.22 }}
              className="text-xs font-medium text-muted-foreground tracking-wide"
            >
              {PHRASES[phraseIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

export default LoadingScreen;
