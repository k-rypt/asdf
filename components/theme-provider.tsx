"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { LucideProvider } from "lucide-react"
import { IconContext } from "@phosphor-icons/react"

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <IconContext.Provider value={{ weight: "fill" }}>
        <LucideProvider strokeWidth={1}>
          {children}
        </LucideProvider>
      </IconContext.Provider>
    </NextThemesProvider>
  )
}
