import { cn } from "@/lib/utils";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Konsistent wrapper för huvudinnehåll. Matchar bredden på kundsidorna.
 */
export const Container = ({ children, className }: ContainerProps) => (
  <div className={cn("w-full mx-auto px-3 sm:px-4 lg:px-6 max-w-5xl", className)}>
    {children}
  </div>
);
