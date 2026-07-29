"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import NavBar from "./NavBar";

/**
 * Auth gate + layout chrome. Redirects unauthenticated users to /login and
 * hides the nav on the login screen itself.
 */
export default function Shell({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isLoginRoute = pathname === "/login";

  useEffect(() => {
    if (!ready) return;
    if (!user && !isLoginRoute) router.replace("/login");
    if (user && isLoginRoute) router.replace("/");
  }, [ready, user, isLoginRoute, router]);

  // Avoid flashing the app (or a redirect) before we've read the session.
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  // Login screen: render bare, no nav.
  if (isLoginRoute) return <>{children}</>;

  // Not authenticated on a protected route — the effect above is redirecting.
  if (!user) return null;

  return (
    <>
      <NavBar />
      <main className="flex-1">{children}</main>
    </>
  );
}
