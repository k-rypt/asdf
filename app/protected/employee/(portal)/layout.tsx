import { EmployeeSidebar } from "@/components/protected/employee/employee-sidebar"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { getUser } from "@/lib/get-user"
import { hasPythonAssessment } from "@/lib/assessment/has-python-assessment"
import { PYODIDE_PREFETCH_FILES } from "@/lib/assessment/pyodide"

/**
 * Sidebar chrome for the employee portal (dashboard, Assessments tab,
 * profile). The assessment-taking route (../assessment) deliberately sits
 * outside this group so it renders as a dedicated, sidebar-free page.
 * Auth and the employee role gate live one level up in ../layout.tsx and
 * apply to both.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  // Warm the browser cache with the Python runtime while the employee is
  // still on the portal, so Run Code is ready without eating into the
  // assessment timer (which starts when the assessment page opens).
  const prefetchPython = user ? await hasPythonAssessment(user.id) : false

  return (
    <SidebarProvider>
      {prefetchPython &&
        PYODIDE_PREFETCH_FILES.map((href) => <link key={href} rel="prefetch" href={href} crossOrigin="anonymous" />)}
      <EmployeeSidebar />
      <main className="w-full">
        <div className="flex items-center justify-between p-2">
          <SidebarTrigger />
          <ThemeToggle />
        </div>
        <div className="px-6 pb-6">{children}</div>
      </main>
    </SidebarProvider>
  )
}
