"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

type LogoutButtonProps = {
  label?: string;
};

export function LogoutButton({ label = "Logout" }: LogoutButtonProps) {
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    setLoading(true);
    await signOut({
      callbackUrl: "/login",
    });
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={onLogout} disabled={loading}>
      {loading ? "Logging out..." : label}
    </Button>
  );
}
