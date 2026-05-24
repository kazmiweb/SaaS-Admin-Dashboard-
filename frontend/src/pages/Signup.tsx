import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Link as MuiLink,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../app/api";
import { setTokens } from "../app/auth";
import { getDeviceId } from "../app/device";
import {
  extractCooldownSeconds,
  extractExpiresInSeconds,
  extractRetryAfterSeconds,
  normalizeEmailInput,
  normalizeOtpInput,
} from "../utils/otp";

export default function Signup() {
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [signupToken, setSignupToken] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [otpCooldownLeft, setOtpCooldownLeft] = useState(0);
  const [otpExpiresInLeft, setOtpExpiresInLeft] = useState<number | null>(null);

  useEffect(() => {
    if (otpCooldownLeft <= 0 && (!otpExpiresInLeft || otpExpiresInLeft <= 0)) return;
    const timer = window.setInterval(() => {
      setOtpCooldownLeft((prev) => (prev > 0 ? prev - 1 : 0));
      setOtpExpiresInLeft((prev) => {
        if (prev === null) return prev;
        return prev > 0 ? prev - 1 : 0;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpCooldownLeft, otpExpiresInLeft]);

  function applyOtpMeta(data: any) {
    const cooldown = extractCooldownSeconds(data);
    if (cooldown) setOtpCooldownLeft(cooldown);
    const expiresIn = extractExpiresInSeconds(data);
    if (expiresIn) setOtpExpiresInLeft(expiresIn);
  }

  async function requestOtp() {
    setErr(null);
    const normalizedEmail = normalizeEmailInput(email);
    setEmail(normalizedEmail);
    setBusy(true);
    try {
      const resp = await api.post("/auth/request-otp", { email: normalizedEmail });
      applyOtpMeta(resp?.data);
      setOtp("");
      setStep(2);
    } catch (ex: any) {
      const waitSeconds = extractRetryAfterSeconds(ex);
      if (waitSeconds) setOtpCooldownLeft(waitSeconds);
      setErr(ex?.response?.data?.message ?? "OTP send failed");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setErr(null);
    const normalizedEmail = normalizeEmailInput(email);
    const normalizedOtp = normalizeOtpInput(otp);
    setOtp(normalizedOtp);
    setBusy(true);
    try {
      const resp = await api.post("/auth/verify-otp", { email: normalizedEmail, otp: normalizedOtp });
      setSignupToken(resp.data.signupToken);
      setStep(3);
    } catch (ex: any) {
      setErr(ex?.response?.data?.message ?? "OTP verify failed");
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    setErr(null);
    setBusy(true);
    try {
      const deviceId = getDeviceId();
      const resp = await api.post("/auth/complete-signup", { signupToken, name, password, deviceId });
      setTokens(resp.data.accessToken ?? null, resp.data.refreshToken ?? null, resp.data.role);
      nav("/user/dashboard");
    } catch (ex: any) {
      setErr(ex?.response?.data?.message ?? "Signup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        px: { xs: 2, md: 4 },
        py: { xs: 4, md: 6 },
        background:
          "radial-gradient(circle at top right, rgba(14,165,233,0.2), transparent 28%), radial-gradient(circle at bottom left, rgba(34,197,94,0.14), transparent 24%), linear-gradient(135deg, #071120 0%, #0f172a 46%, #1d4ed8 100%)",
      }}
    >
      <Grid container spacing={4} alignItems="center" justifyContent="center">
        <Grid item xs={12} md={10} lg={5}>
          <Card
            sx={{
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.08)",
              bgcolor: "rgba(9,16,32,0.88)",
              backdropFilter: "blur(14px)",
              boxShadow: "0 24px 90px rgba(0,0,0,0.28)",
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 4 } }}>
              <Stack spacing={3}>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 900 }}>
                    Create account
                  </Typography>
                  <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                    Complete the three-step signup flow using your existing backend endpoints.
                  </Typography>
                </Box>

                {err ? <Alert severity="error">{err}</Alert> : null}

                {step === 1 ? (
                  <Stack spacing={2.5}>
                    <TextField
                      label="Email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      fullWidth
                    />
                    <Button variant="contained" onClick={requestOtp} disabled={busy} fullWidth size="large">
                      {busy ? "Sending..." : "Send OTP"}
                    </Button>
                  </Stack>
                ) : null}

                {step === 2 ? (
                  <Stack spacing={2.5}>
                    <Typography variant="body2" color="text.secondary">
                      OTP sent to <strong>{email}</strong>.{" "}
                      {otpExpiresInLeft && otpExpiresInLeft > 0
                        ? `Expires in ${Math.ceil(otpExpiresInLeft / 60)}m ${otpExpiresInLeft % 60}s.`
                        : "Use the code quickly before it expires."}
                    </Typography>
                    <TextField
                      label="6-digit OTP"
                      value={otp}
                      onChange={(e) => setOtp(normalizeOtpInput(e.target.value))}
                      fullWidth
                    />
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                      <Button variant="contained" onClick={verifyOtp} disabled={busy} fullWidth>
                        {busy ? "Verifying..." : "Verify OTP"}
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={requestOtp}
                        disabled={busy || otpCooldownLeft > 0}
                        fullWidth
                      >
                        {otpCooldownLeft > 0 ? `Resend in ${otpCooldownLeft}s` : "Resend OTP"}
                      </Button>
                      <Button variant="outlined" color="inherit" onClick={() => setStep(1)} fullWidth>
                        Back
                      </Button>
                    </Stack>
                  </Stack>
                ) : null}

                {step === 3 ? (
                  <Stack spacing={2.5}>
                    <TextField
                      label="Full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      fullWidth
                    />
                    <TextField
                      label="Password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      helperText="Minimum 8 characters"
                      autoComplete="new-password"
                      fullWidth
                    />
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                      <Button variant="contained" onClick={complete} disabled={busy} fullWidth>
                        {busy ? "Creating..." : "Create account"}
                      </Button>
                      <Button variant="outlined" color="inherit" onClick={() => setStep(2)} fullWidth>
                        Back
                      </Button>
                    </Stack>
                  </Stack>
                ) : null}

                <Divider />

                <Typography variant="body2" color="text.secondary" textAlign="center">
                  Already have account?{" "}
                  <MuiLink component={Link} to="/login" underline="hover">
                    Login
                  </MuiLink>
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
