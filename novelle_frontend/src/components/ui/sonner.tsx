import { CircleAlertIcon, CircleCheckIcon, InfoIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useTheme } from "@/app/ThemeProvider"

/*
 * Novelle toast: surface-raised card, line border, shadow-raise, radius-lg, bottom-right, close button.
 * Icon colour carries the status (success / critical / warning); the message repeats the button verb.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme}
      position="bottom-right"
      closeButton
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-5 text-success" strokeWidth={1.75} />,
        info: <InfoIcon className="size-5 text-primary" strokeWidth={1.75} />,
        warning: <TriangleAlertIcon className="size-5 text-warning" strokeWidth={1.75} />,
        error: <CircleAlertIcon className="size-5 text-destructive" strokeWidth={1.75} />,
        loading: <Loader2Icon className="size-5 animate-spin text-primary" strokeWidth={1.75} />,
      }}
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border-border !bg-card !text-foreground !shadow-raise font-sans",
          title: "!text-label !font-normal",
          description: "!text-small !text-muted-foreground",
          actionButton: "!h-8 !rounded-md !bg-accent !px-2.5 !text-small !font-semibold !text-accent-foreground",
        },
      }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--card-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-lg)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
