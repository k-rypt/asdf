"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Sun, Moon, Monitor, Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export interface ThemeToggleProps {
  className?: string
  align?: "start" | "center" | "end"
  variant?: "ghost" | "outline" | "default" | "secondary"
  size?: "default" | "sm" | "lg" | "icon" | "icon-sm"
}

export function ThemeToggle({
  className,
  align = "end",
  variant = "ghost",
  size = "icon",
}: ThemeToggleProps) {
  const { setTheme, theme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={variant}
            size={size}
            className={cn("relative cursor-pointer", className)}
            aria-label="Toggle theme"
          >
            <Sun className="size-[1.15rem] scale-100 rotate-0 transition-transform duration-200 dark:scale-0 dark:-rotate-90" />
            <Moon className="absolute size-[1.15rem] scale-0 rotate-90 transition-transform duration-200 dark:scale-100 dark:rotate-0" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        }
      />
      <DropdownMenuContent align={align} className="min-w-36">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className="flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Sun className="size-4" />
            <span>Light</span>
          </span>
          {mounted && theme === "light" && <Check className="size-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className="flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Moon className="size-4" />
            <span>Dark</span>
          </span>
          {mounted && theme === "dark" && <Check className="size-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className="flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Monitor className="size-4" />
            <span>System</span>
          </span>
          {mounted && theme === "system" && <Check className="size-4 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Submenu item for embedding directly inside existing DropdownMenus (e.g. user menus)
 */
export function ThemeSubMenu() {
  const { setTheme, theme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="cursor-pointer">
        <div className="relative size-4 mr-2 flex items-center justify-center">
          <Sun className="size-4 scale-100 rotate-0 transition-transform duration-200 dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute size-4 scale-0 rotate-90 transition-transform duration-200 dark:scale-100 dark:rotate-0" />
        </div>
        <span>Theme</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-36">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className="flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Sun className="size-4" />
            <span>Light</span>
          </span>
          {mounted && theme === "light" && <Check className="size-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className="flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Moon className="size-4" />
            <span>Dark</span>
          </span>
          {mounted && theme === "dark" && <Check className="size-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className="flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Monitor className="size-4" />
            <span>System</span>
          </span>
          {mounted && theme === "system" && <Check className="size-4 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
