"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

const DEMO_EMAIL = "jordan@techflow.com";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = login(email.trim(), password);
    if (!result.ok) {
      setError(result.error ?? "Could not sign in.");
      return;
    }
    router.replace("/");
  };

  const fillDemo = () => {
    setEmail(DEMO_EMAIL);
    setPassword("demo1234");
    setError(null);
  };

  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center">
          <span className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-slate-900 text-lg font-bold text-white">
            TF
          </span>
          <h1 className="text-xl font-bold text-slate-900">
            Sign in to TriageFlow
          </h1>
          <p className="mt-1 text-sm text-slate-500">TechFlow Support Console</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Work email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            placeholder="you@techflow.com"
          />

          <label className="mb-1 block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            placeholder="••••••••"
          />

          {error && (
            <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Sign in
          </button>

          <button
            type="button"
            onClick={fillDemo}
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Use demo credentials
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          Demo mode — no real account needed. Any valid email and password will
          sign you in.
        </p>
      </div>
    </div>
  );
}
