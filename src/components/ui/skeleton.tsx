import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md bg-surface-raised",
        "bg-[linear-gradient(105deg,var(--color-surface-raised)_40%,var(--color-surface-dark)_50%,var(--color-surface-raised)_60%)]",
        "bg-size-[200%_100%] animate-shimmer",
        "motion-reduce:animate-none motion-reduce:bg-none motion-reduce:bg-surface-raised",
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
