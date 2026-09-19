import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

const SPRING_TRANSITION = { type: "spring" as const, stiffness: 500, damping: 30 };

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, disabled, ...props }, ref) => {
  const shouldReduceMotion = useReducedMotion();
  const motionProps =
    !disabled && !shouldReduceMotion
      ? {
          whileHover: { scale: 1.03 },
          whileTap: { scale: 0.95 },
          transition: SPRING_TRANSITION,
        }
      : {};

  return (
    <SwitchPrimitives.Root asChild disabled={disabled} {...props}>
      <motion.button
        ref={ref}
        type="button"
        role="switch"
        className={cn(
          "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
          className,
        )}
        {...motionProps}
      >
        <SwitchPrimitives.Thumb
          className={cn(
            "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
          )}
        />
      </motion.button>
    </SwitchPrimitives.Root>
  );
});
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
