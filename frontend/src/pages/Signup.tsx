import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../app/api";
import { setTokens } from "../app/auth";
import { getDeviceId } from "../app/device";

export default function Signup() {
  const nav = useNavigate();
  const [step, setStep] = useState<1|2|3>(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [signupToken, setSignupToken] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string|null>(null);
  const [busy, setBusy] = useState(false);

  async function requestOtp() {
    setErr(null); setBusy(true);
    try{
      await api.post("/auth/request-otp", { email });
      setStep(2);
    }catch(ex:any){
      setErr(ex?.response?.data?.message ?? "OTP send failed");
    }finally{ setBusy(false); }
  }

  async function verifyOtp() {
    setErr(null); setBusy(true);
    try{
      const resp = await api.post("/auth/verify-otp", { email, otp });
      setSignupToken(resp.data.signupToken);
      setStep(3);
    }catch(ex:any){
      setErr(ex?.response?.data?.message ?? "OTP verify failed");
    }finally{ setBusy(false); }
  }

  async function complete() {
    setErr(null); setBusy(true);
    try{
      const deviceId = getDeviceId();
      const resp = await api.post("/auth/complete-signup", { signupToken, name, password, deviceId });
      // New users are USER -> session
      setTokens(null, null, resp.data.role);
      nav("/user/dashboard");
    }catch(ex:any){
      setErr(ex?.response?.data?.message ?? "Signup failed");
    }finally{ setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 to-slate-200">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-6">
        <div className="text-center">
          <div className="text-3xl font-extrabold text-cyan-700">Elookup</div>
          <div className="text-sm text-slate-500 mt-1">Email OTP Signup</div>
        </div>

        {err && <div className="mt-4 p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-sm">{err}</div>}

        {step === 1 && (
          <div className="mt-5 space-y-3">
            <input className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
              placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
            <button disabled={busy} onClick={requestOtp} className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold">
              {busy ? "Sending..." : "Send OTP"}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="mt-5 space-y-3">
            <div className="text-sm text-slate-600">OTP sent to <b>{email}</b> (expires in 10 minutes)</div>
            <input className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
              placeholder="6-digit OTP" value={otp} onChange={(e)=>setOtp(e.target.value)} />
            <button disabled={busy} onClick={verifyOtp} className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold">
              {busy ? "Verifying..." : "Verify OTP"}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="mt-5 space-y-3">
            <input className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
              placeholder="Full name" value={name} onChange={(e)=>setName(e.target.value)} />
            <input className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
              placeholder="Password (min 8)" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
            <button disabled={busy} onClick={complete} className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold">
              {busy ? "Creating..." : "Create Account"}
            </button>
          </div>
        )}

        <div className="mt-4 text-sm text-center text-slate-600">
          Already have account? <Link to="/login" className="font-bold text-blue-700">Login</Link>
        </div>
      </div>
    </div>
  );
}
