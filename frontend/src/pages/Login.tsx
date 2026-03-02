import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../app/api";
import { setTokens } from "../app/auth";
import { getDeviceId } from "../app/device";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string|null>(null);
  const [busy, setBusy] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [resetEmail, setResetEmail] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try{
      const deviceId = getDeviceId();
      const resp = await api.post("/auth/login", { email, password, deviceId });
      // Session-based for USER/RESELLER (do not persist JWT)
      if (resp.data.role === "USER" || resp.data.role === "RESELLER") {
        setTokens(null, null, resp.data.role);
      } else {
        setTokens(resp.data.accessToken, resp.data.refreshToken, resp.data.role);
      }
      nav(resp.data.role === "ADMIN" ? "/admin/dashboard" : resp.data.role === "RESELLER" ? "/reseller/dashboard" : "/user/dashboard");
    }catch(ex:any){
      const code = ex?.response?.data?.code;
      if (code === "DEVICE_MISMATCH") {
        setShowReset(true);
        setResetEmail(email);
        setErr(ex?.response?.data?.message ?? "This account is bound to another device.");
      } else {
        setErr(ex?.response?.data?.message ?? "Login failed");
      }
    }finally{
      setBusy(false);
    }
  }

  async function sendResetOtp() {
    setErr(null);
    try {
      await api.post("/auth/device-reset/request", { email: resetEmail });
      setOtpSent(true);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Failed to send OTP");
    }
  }

  async function verifyResetOtp() {
    setErr(null);
    try {
      const newDeviceId = getDeviceId();
      await api.post("/auth/device-reset/verify", { email: resetEmail, otp, newDeviceId });
      setShowReset(false);
      setOtpSent(false);
      setOtp("");
      // Try login again
      await submit({ preventDefault(){} } as any);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Failed to verify OTP");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 to-slate-200">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-6">
        <div className="text-center">
          <div className="text-3xl font-extrabold text-cyan-700">Elookup</div>
          <div className="text-sm text-slate-500 mt-1">Intelligence Search</div>
        </div>

        {err && <div className="mt-4 p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-sm">{err}</div>}

        {showReset && (
          <div className="mt-4 p-4 rounded-2xl border border-slate-200 bg-slate-50">
            <div className="font-extrabold text-slate-800">Reset Device (Email Verification)</div>
            <div className="text-xs text-slate-600 mt-1">
              This account is locked to a single device. Verify OTP to reset the bound device.
            </div>
            <div className="mt-3 space-y-2">
              <input
                className="w-full px-4 py-3 rounded-xl border border-slate-200"
                placeholder="Email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
              />
              {!otpSent ? (
                <button type="button" onClick={sendResetOtp} className="w-full py-3 rounded-xl bg-slate-900 text-white font-extrabold">
                  Send OTP
                </button>
              ) : (
                <>
                  <input
                    className="w-full px-4 py-3 rounded-xl border border-slate-200"
                    placeholder="6-digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                  <button type="button" onClick={verifyResetOtp} className="w-full py-3 rounded-xl bg-blue-600 text-white font-extrabold">
                    Verify & Reset
                  </button>
                </>
              )}
              <button type="button" onClick={() => { setShowReset(false); setOtpSent(false); setOtp(""); }} className="w-full py-2 rounded-xl border border-slate-200">
                Cancel
              </button>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="mt-5 space-y-3">
          <input className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
            placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
          <input className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
            placeholder="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
          <button disabled={busy} className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold">
            {busy ? "Signing in..." : "Login"}
          </button>
        </form>

        <div className="mt-4 text-sm text-center text-slate-600">
          New user? <Link to="/signup" className="font-bold text-blue-700">Create account</Link>
        </div>
      </div>
    </div>
  );
}
