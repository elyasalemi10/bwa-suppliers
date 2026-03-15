"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode } from "react";
import { ToastProvider } from "./Toast";

const NAV_ITEMS = [
  { href: "/", label: "Suppliers" },
  { href: "/batch", label: "Batch Process" },
  { href: "/search", label: "Search" },
  { href: "/export", label: "Export" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Don't show shell on login page
  if (pathname === "/login") {
    return <ToastProvider>{children}</ToastProvider>;
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-white">
        <header className="border-b border-[#E5E5E5]">
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
                />
                <span className="font-bold text-[#111] text-sm">BWA Converter</span>
              </Link>
              <nav className="flex items-center gap-1">
                {NAV_ITEMS.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? pathname === "/" || pathname.startsWith("/suppliers")
                      : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`px-3 py-1.5 rounded text-sm transition ${
                        isActive
                          ? "bg-[#111] text-white font-bold"
                          : "text-[#111] hover:bg-[#f5f5f5]"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-[#111] hover:underline"
            >
              Logout
            </button>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
      </div>
    </ToastProvider>
  );
}
