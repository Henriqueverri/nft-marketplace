import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Tabs as TabsPrimitive } from "radix-ui"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default:
          "h-8 rounded-lg bg-muted p-[3px] group-data-horizontal/tabs:h-8",
        // Figma NFT detail tabs: cream default, accent+3px brand underline when active, 0.3px brand hairline.
        line: "relative h-auto w-full flex-wrap justify-start gap-x-8 gap-y-3 rounded-none border-0 bg-transparent p-0 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-[0.3px] after:bg-brand",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap transition-colors group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // Default (pill) variant — shadcn baseline.
        "group-data-[variant=default]/tabs-list:h-[calc(100%-1px)] group-data-[variant=default]/tabs-list:rounded-md group-data-[variant=default]/tabs-list:border group-data-[variant=default]/tabs-list:border-transparent group-data-[variant=default]/tabs-list:px-1.5 group-data-[variant=default]/tabs-list:py-0.5 group-data-[variant=default]/tabs-list:text-sm group-data-[variant=default]/tabs-list:font-medium group-data-[variant=default]/tabs-list:text-foreground/60 group-data-[variant=default]/tabs-list:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:bg-background group-data-[variant=default]/tabs-list:data-active:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm",
        // Line variant — Kurio NFT tabs (Figma 70342:2773).
        "group-data-[variant=line]/tabs-list:h-auto group-data-[variant=line]/tabs-list:flex-initial group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:border-0 group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:px-0 group-data-[variant=line]/tabs-list:pb-3 group-data-[variant=line]/tabs-list:text-left group-data-[variant=line]/tabs-list:text-[17px] group-data-[variant=line]/tabs-list:leading-4 group-data-[variant=line]/tabs-list:font-normal group-data-[variant=line]/tabs-list:text-cream group-data-[variant=line]/tabs-list:whitespace-normal group-data-[variant=line]/tabs-list:shadow-none group-data-[variant=line]/tabs-list:hover:text-brand-accent group-data-[variant=line]/tabs-list:data-active:bg-transparent group-data-[variant=line]/tabs-list:data-active:font-bold group-data-[variant=line]/tabs-list:data-active:text-brand-accent group-data-[variant=line]/tabs-list:data-active:shadow-none",
        "group-data-[variant=line]/tabs-list:after:absolute group-data-[variant=line]/tabs-list:after:inset-x-0 group-data-[variant=line]/tabs-list:after:bottom-0 group-data-[variant=line]/tabs-list:after:h-[3px] group-data-[variant=line]/tabs-list:after:bg-brand group-data-[variant=line]/tabs-list:after:opacity-0 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
