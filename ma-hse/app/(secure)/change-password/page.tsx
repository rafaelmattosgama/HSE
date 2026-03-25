import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/feature/change-password-form";
import { LogoutButton } from "@/components/layout/logout-button";
import { authOptions } from "@/lib/auth/options";

export default async function ChangePasswordPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.mustChangePassword) {
    redirect("/app/corporate");
  }

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-10">
      <div className="mb-6 flex justify-end">
        <LogoutButton label="Logout" />
      </div>
      <ChangePasswordForm />
    </main>
  );
}
