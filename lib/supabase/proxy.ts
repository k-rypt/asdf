import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { redirectsSignedInUser } from "@/lib/auth/routing";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase environment variables in proxy");
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
        if (headers) {
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          );
        }
      },
    },
  });

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // Archived accounts (profiles.status = 'inactive'). The Supabase Auth
  // ban blocks new logins and token refreshes; this cuts off sessions
  // that are still valid, on their very next request. If the auth server
  // rejects the banned user's token outright, getUser returns no user with
  // a user_banned error -- treat that the same way, or the person would
  // see generic "not signed in" errors instead of the archived message.
  const bannedByAuth = userError?.code === "user_banned";
  let archived = bannedByAuth;
  if (user && !archived) {
    const { data: profile } = await supabase.from("profiles").select("status").eq("id", user.id).maybeSingle();
    archived = profile?.status === "inactive";
  }
  if (archived) {
    const path = request.nextUrl.pathname;
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "account_archived" }, { status: 401 });
    }
    // Local scope: clears this browser's session cookies without a call
    // to the auth server, which rejects banned users.
    await supabase.auth.signOut({ scope: "local" });
    if (path.startsWith("/auth")) {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.search = "?archived=1";
    const redirect = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  // Protect /protected routes from unauthenticated access
  if (!user && request.nextUrl.pathname.startsWith("/protected")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from the login and landing pages
  if (user && redirectsSignedInUser(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/protected";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  return supabaseResponse;
}
