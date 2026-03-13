import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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

  async function requestOtp() {
    setErr(null);
    setBusy(true);
    try {
      await api.post("/auth/request-otp", { email });
      setStep(2);
    } catch (ex: any) {
      setErr(ex?.response?.data?.message ?? "OTP send failed");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setErr(null);
    setBusy(true);
    try {
      const resp = await api.post("/auth/verify-otp", { email, otp });
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
      setTokens(null, null, resp.data.role);
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
        <Grid item xs={12} lg={5}>
          <Stack spacing={2.5} sx={{ maxWidth: 560, color: "common.white" }}>
            <Chip
              label="OTP Signup"
              sx={{
                alignSelf: "flex-start",
                bgcolor: "rgba(255,255,255,0.08)",
                color: "common.white",
                borderRadius: 999,
                fontWeight: 800,
              }}
            />
            <Typography variant="h3" sx={{ fontWeight: 900, lineHeight: 1.05 }}>
              Create your Elookup account with verified email onboarding.
            </Typography>
            <Typography sx={{ color: "rgba(255,255,255,0.72)", maxWidth: 520 }}>
              The signup flow remains backend-driven. Email OTP verification, device binding, and post-signup role routing are preserved.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} pt={1}>
              <FlowPill label="Email verification" active={step >= 1} />
              <FlowPill label="OTP confirm" active={step >= 2} />
              <FlowPill label="Account setup" active={step >= 3} />
            </Stack>
          </Stack>
        </Grid>

        <Grid item xs={12} md={10} lg={4}>
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
                      OTP sent to <strong>{email}</strong>. It expires in 10 minutes.
                    </Typography>
                    <TextField
                      label="6-digit OTP"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      fullWidth
                    />
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                      <Button variant="contained" onClick={verifyOtp} disabled={busy} fullWidth>
                        {busy ? "Verifying..." : "Verify OTP"}
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

function FlowPill({ label, active }: { label: string; active: boolean }) {
  return (
    <Chip
      label={label}
      sx={{
        bgcolor: active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)",
        color: "common.white",
        borderRadius: 999,
        fontWeight: 700,
      }}
    />
  );
}
