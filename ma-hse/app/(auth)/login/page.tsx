"use client";

import { Eye, EyeOff, LockKeyhole, ShieldCheck, User } from "lucide-react";
import { useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { MaSymbol } from "@/components/branding/ma-symbol";

export default function LoginPage() {
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl") ?? "/app/corporate";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loadingCredentials, setLoadingCredentials] = useState(false);
  const [loadingSso, setLoadingSso] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submitCredentials(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoadingCredentials(true);

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
        callbackUrl,
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      const session = await getSession();
      if (session?.user?.language) {
        await fetch("/api/locale", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ locale: session.user.language }),
        });
      }

      const isCorporate = session?.user?.plantRoles?.some((entry) => entry.role === "N0_ADMIN" || entry.role === "N1_CORPORATE");
      const primaryPlant = session?.user?.plantRoles?.find((entry) => entry.plantCode)?.plantCode;

      if (session?.user?.plantRoles?.some((entry) => entry.role === "N0_ADMIN")) {
        window.location.href = "/app/settings";
        return;
      }

      if (isCorporate) {
        window.location.href = "/app/corporate";
        return;
      }

      if (primaryPlant) {
        window.location.href = `/app/${primaryPlant}/dashboards`;
        return;
      }

      if (result?.url) {
        window.location.href = result.url;
        return;
      }

      setError("Login failed. Please verify credentials and app URL.");
    } finally {
      setLoadingCredentials(false);
    }
  }

  async function submitMagicLink() {
    setError("");

    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }

    setLoadingSso(true);

    try {
      const result = await signIn("email", {
        email,
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      setError("Access link sent. Check your inbox.");
    } finally {
      setLoadingSso(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#061a52] px-2 py-2 md:px-4 md:py-4">
      <div className="mx-auto grid min-h-[calc(100vh-1rem)] w-full max-w-[1420px] overflow-hidden rounded-[24px] bg-[#061a52] lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-[20px] bg-[radial-gradient(circle_at_30%_18%,rgba(42,97,255,0.28),transparent_30%),radial-gradient(circle_at_72%_58%,rgba(0,140,255,0.18),transparent_28%),linear-gradient(145deg,#061a52_0%,#03133e_55%,#03103a_100%)] px-5 py-8 text-white md:px-8 lg:rounded-r-none lg:px-10 xl:px-12">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute left-[14%] top-[12%] h-44 w-44 rounded-full bg-[#1685ff] blur-3xl" />
            <div className="absolute bottom-[10%] right-[16%] h-36 w-36 rounded-full bg-[#0c49c7] blur-3xl" />
          </div>

          <div className="relative z-10 flex max-w-[460px] flex-col items-center text-center">
            <MaSymbol className="h-[78px] w-[152px] text-white" title="MA" />

            <div className="mt-6 leading-none">
              <h1 className="text-[42px] font-semibold tracking-normal text-white md:text-[54px] xl:text-[62px]">
                <span className="bg-[linear-gradient(180deg,#3eb1ff_0%,#0674ff_100%)] bg-clip-text text-transparent">MA</span>x Safety
              </h1>
              <p className="mt-3 text-[19px] font-normal tracking-normal text-white/95 md:text-[23px] xl:text-[26px]">
                Integrated Safety Platform
              </p>
            </div>

            <div className="mt-6 h-[3px] w-[62px] rounded-full bg-[#1fa0ff]" />

            <div className="mt-8 space-y-1 text-[15px] leading-relaxed text-white/95 md:text-[17px]">
              <p>software developed by</p>
              <p>MAAP - MA Automotive Portugal</p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-3 py-3 md:px-5 md:py-5 lg:px-6 xl:px-8">
          <div className="w-full max-w-[690px] rounded-[20px] bg-white px-5 py-6 shadow-[0_24px_60px_rgba(5,15,55,0.28)] md:px-8 md:py-8 lg:px-9 lg:py-8">
            <div className="text-center text-[#15245d]">
              <p className="text-[18px] font-normal md:text-[20px]">Welcome to</p>
              <h2 className="mt-2 text-[22px] font-semibold leading-tight md:text-[28px] xl:text-[34px]">
                MAx Safety - Integrated Safety Platform
              </h2>
              <p className="mt-4 text-[19px] font-normal md:text-[23px]">Sign in to continue</p>
            </div>

            <form onSubmit={submitCredentials} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-[14px] font-semibold text-[#15245d] md:text-[15px]">Email</span>
                <div className="flex h-12 items-center rounded-[10px] border border-[#c7d1e6] px-3.5 md:h-[54px]">
                  <User className="h-5 w-5 text-[#66789f]" strokeWidth={2} />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-full w-full border-0 bg-transparent px-3 text-[15px] text-[#15245d] placeholder:text-[#6d7da2] focus:ring-0 md:text-[16px]"
                    placeholder="name@company.com"
                    required
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-[14px] font-semibold text-[#15245d] md:text-[15px]">Password</span>
                <div className="flex h-12 items-center rounded-[10px] border border-[#c7d1e6] px-3.5 md:h-[54px]">
                  <LockKeyhole className="h-5 w-5 text-[#66789f]" strokeWidth={2} />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-full w-full border-0 bg-transparent px-3 text-[15px] text-[#15245d] placeholder:text-[#6d7da2] focus:ring-0 md:text-[16px]"
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="rounded-full p-1 text-[#66789f] transition hover:bg-slate-100"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" strokeWidth={2} /> : <Eye className="h-5 w-5" strokeWidth={2} />}
                  </button>
                </div>
              </label>

              <div className="flex justify-end">
                <button type="button" className="text-[13px] font-medium text-[#0a4dff] hover:underline md:text-[14px]">
                  Forgot your password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loadingCredentials}
                className="flex h-12 w-full items-center justify-center rounded-[10px] bg-[#061a52] text-[17px] font-semibold text-white shadow-[0_8px_20px_rgba(6,26,82,0.14)] transition hover:bg-[#082267] disabled:cursor-not-allowed disabled:opacity-70 md:h-[54px] md:text-[19px]"
              >
                {loadingCredentials ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <div className="my-5 flex items-center gap-4 text-[#5e6d92] md:my-6">
              <div className="h-px flex-1 bg-[#ccd5e8]" />
              <span className="text-[14px] md:text-[15px]">or</span>
              <div className="h-px flex-1 bg-[#ccd5e8]" />
            </div>

            <button
              type="button"
              onClick={submitMagicLink}
              disabled={loadingSso}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-[10px] border-2 border-[#0a4dff] bg-white text-[17px] font-semibold text-[#0a4dff] transition hover:bg-[#f5f8ff] disabled:cursor-not-allowed disabled:opacity-70 md:h-[54px] md:text-[18px]"
            >
              <ShieldCheck className="h-5 w-5 md:h-6 md:w-6" strokeWidth={2.1} />
              <span>{loadingSso ? "Sending access link..." : "Sign in with SSO"}</span>
            </button>

            {error ? (
              <p className={`mt-3 text-center text-[13px] md:text-[14px] ${error.includes("sent") ? "text-emerald-700" : "text-red-700"}`}>
                {error}
              </p>
            ) : null}

            <p className="mt-6 text-center text-[13px] text-[#4f5e84] md:text-[14px]">
              Need help? Contact your <span className="font-medium text-[#0a4dff]">system administrator.</span>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
