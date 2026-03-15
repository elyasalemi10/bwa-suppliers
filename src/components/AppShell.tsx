"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/", label: "Suppliers" },
  { href: "/process", label: "Process" },
  { href: "/batch", label: "Batch" },
  { href: "/search", label: "Search" },
  { href: "/export", label: "Export" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login") {
    return (
      <>
        {children}
        <Toaster />
      </>
    );
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.webp"
                  alt="BWA"
                  width={32}
                  height={32}
                  className="object-contain"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
                <span className="font-semibold text-foreground text-sm">BWA Converter</span>
              </Link>
              <nav className="flex items-center gap-1">
                {NAV_ITEMS.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? pathname === "/" || pathname.startsWith("/suppliers")
                      : pathname.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href}>
                      <Button
                        variant={isActive ? "default" : "ghost"}
                        size="sm"
                      >
                        {item.label}
                      </Button>
                    </Link>
                  );
                })}
              </nav>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
      </div>
      <Toaster />
    </>
  );
}
