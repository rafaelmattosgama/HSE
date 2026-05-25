"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

type LogoutButtonProps = {
  label?: string;
};

export function LogoutButton({ label = "Logout" }: LogoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onLogout() {
    setLoading(true);
    setError("");

    try {
      await signOut({
        redirect: false,
        callbackUrl: "/login",
      });

      // Keep the final navigation same-origin instead of relying on a possibly
      // misconfigured absolute NEXTAUTH_URL in production.
      window.location.assign("/login");
    } catch {
      setLoading(false);
      setError("Logout failed. Reload the page and try again.");
    }
  }

  return error ? (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={onLogout} disabled={loading}>
        <LogOut className="h-4 w-4" />
        {loading ? "Logging out..." : label}
      </Button>
      <span className="text-xs text-red-600">{error}</span>
    </div>
  ) : (
    <Button type="button" variant="secondary" size="sm" onClick={onLogout} disabled={loading}>
      <LogOut className="h-4 w-4" />
      {loading ? "Logging out..." : label}
    </Button>
  );
}
