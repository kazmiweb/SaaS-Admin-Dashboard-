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

type PublicSupportMessage = {
  id: string;
  senderType: "USER" | "ADMIN" | "SYSTEM";
  body: string;
  createdAt: string;
};

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactToken, setContactToken] = useState<string | null>(null);
  const [contactThread, setContactThread] = useState<PublicSupportMessage[]>([]);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactErr, setContactErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const deviceId = getDeviceId();
      const resp = await api.post("/auth/login", { email, password, deviceId });
      if (resp.data.role === "USER" || resp.data.role === "RESELLER") {
        setTokens(null, null, resp.data.role);
      } else {
        setTokens(resp.data.accessToken, resp.data.refreshToken, resp.data.role);
      }
      nav(resp.data.role === "ADMIN" ? "/admin/dashboard" : resp.data.role === "RESELLER" ? "/reseller/dashboard" : "/user/dashboard");
    } catch (ex: any) {
      const code = ex?.response?.data?.code;
      if (code === "DEVICE_MISMATCH") {
        setShowReset(true);
        setResetEmail(email);
        setErr(ex?.response?.data?.message ?? "This account is bound to another device.");
      } else {
        setErr(ex?.response?.data?.message ?? "Login failed");
      }
    } finally {
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
      await submit({ preventDefault() {} } as React.FormEvent);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Failed to verify OTP");
    }
  }

  async function loadSupportThread(ticketToken: string, emailAddress: string) {
    if (!ticketToken || !emailAddress) return;
    try {
      const res = await api.get(`/support/public/${encodeURIComponent(ticketToken)}/messages`, {
        params: { email: emailAddress.trim() },
      });
      setContactThread(res.data?.messages ?? []);
    } catch {
      // keep silent during polling
    }
  }

  async function sendSupportMessage() {
    if (!contactEmail.trim() || !contactMessage.trim()) {
      setContactErr("Email and message are required.");
      return;
    }

    setContactBusy(true);
    setContactErr(null);
    try {
      if (!contactToken) {
        const res = await api.post("/support/contact", {
          name: contactName.trim() || undefined,
          email: contactEmail.trim(),
          subject: "Login page support request",
          source: "login",
          message: contactMessage.trim(),
        });
        const token = String(res.data?.ticket?.token ?? "");
        setContactToken(token || null);
        setContactMessage("");
        if (token) {
          await loadSupportThread(token, contactEmail.trim());
        }
      } else {
        await api.post(`/support/public/${encodeURIComponent(contactToken)}/messages`, {
          name: contactName.trim() || undefined,
          email: contactEmail.trim(),
          message: contactMessage.trim(),
        });
        setContactMessage("");
        await loadSupportThread(contactToken, contactEmail.trim());
      }
    } catch (e: any) {
      setContactErr(e?.response?.data?.message ?? "Unable to send support message.");
    } finally {
      setContactBusy(false);
    }
  }

  React.useEffect(() => {
    if (!contactToken || !contactEmail.trim()) return;
    loadSupportThread(contactToken, contactEmail.trim()).catch(() => void 0);
    const timer = window.setInterval(() => {
      loadSupportThread(contactToken, contactEmail.trim()).catch(() => void 0);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [contactToken, contactEmail]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        px: { xs: 2, md: 4 },
        py: { xs: 4, md: 6 },
        background:
          "radial-gradient(circle at top left, rgba(37,99,235,0.22), transparent 28%), radial-gradient(circle at bottom right, rgba(20,184,166,0.2), transparent 24%), linear-gradient(135deg, #071120 0%, #0f172a 46%, #134e4a 100%)",
      }}
    >
      <Grid container spacing={4} alignItems="center" justifyContent="center">
        <Grid item xs={12} lg={5}>
          <Stack spacing={2.5} sx={{ maxWidth: 560, color: "common.white" }}>
            <Chip
              label="Secure Access"
              sx={{
                alignSelf: "flex-start",
                bgcolor: "rgba(255,255,255,0.08)",
                color: "common.white",
                borderRadius: 999,
                fontWeight: 800,
              }}
            />
            <Typography variant="h3" sx={{ fontWeight: 900, lineHeight: 1.05 }}>
              Sign in to the unified Elookup control center.
            </Typography>
            <Typography sx={{ color: "rgba(255,255,255,0.72)", maxWidth: 520 }}>
              Admin, reseller, and user dashboards all continue to use the current backend auth flow, existing sessions, and device-bound account controls.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} pt={1}>
              <FeaturePill label="Role-based redirect" />
              <FeaturePill label="OTP device reset" />
              <FeaturePill label="Backend-compatible" />
            </Stack>
          </Stack>
        </Grid>

        <Grid item xs={12} md={10} lg={4}>
          <Stack spacing={2.2}>
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
                      Login
                    </Typography>
                    <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                      Use your existing account credentials. Access is routed by the backend role.
                    </Typography>
                  </Box>

                  {err ? <Alert severity="error">{err}</Alert> : null}

                  {showReset ? (
                    <Stack spacing={2.5}>
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 800 }}>
                          Reset bound device
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          Send an OTP to your registered email, then verify it to replace the device binding.
                        </Typography>
                      </Box>

                      <TextField
                        label="Email"
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        fullWidth
                      />

                      {otpSent ? (
                        <TextField
                          label="6-digit OTP"
                          value={otp}
                          onChange={(e) => setOtp(e.target.value)}
                          fullWidth
                        />
                      ) : null}

                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        {!otpSent ? (
                          <Button variant="contained" onClick={sendResetOtp} fullWidth>
                            Send OTP
                          </Button>
                        ) : (
                          <Button variant="contained" onClick={verifyResetOtp} fullWidth>
                            Verify and reset
                          </Button>
                        )}
                        <Button
                          variant="outlined"
                          color="inherit"
                          onClick={() => {
                            setShowReset(false);
                            setOtpSent(false);
                            setOtp("");
                          }}
                          fullWidth
                        >
                          Cancel
                        </Button>
                      </Stack>
                    </Stack>
                  ) : (
                    <Box component="form" onSubmit={submit}>
                      <Stack spacing={2.5}>
                        <TextField
                          label="Email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          autoComplete="email"
                          fullWidth
                        />
                        <TextField
                          label="Password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="current-password"
                          fullWidth
                        />
                        <Button type="submit" variant="contained" size="large" disabled={busy} fullWidth>
                          {busy ? "Signing in..." : "Login"}
                        </Button>
                      </Stack>
                    </Box>
                  )}

                  <Divider />

                  <Typography variant="body2" color="text.secondary" textAlign="center">
                    New user?{" "}
                    <MuiLink component={Link} to="/signup" underline="hover">
                      Create account
                    </MuiLink>
                  </Typography>
                </Stack>
              </CardContent>
            </Card>

            <Card
              sx={{
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.08)",
                bgcolor: "rgba(9,16,32,0.88)",
                backdropFilter: "blur(14px)",
              }}
            >
              <CardContent sx={{ p: { xs: 2.2, md: 2.8 } }}>
                <Stack spacing={1.5}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 900 }}>
                      Contact Admin Live Chat
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Complaint token auto-generated. Replies refresh every 5 seconds.
                    </Typography>
                  </Box>

                  {contactErr ? <Alert severity="error">{contactErr}</Alert> : null}
                  {contactToken ? <Alert severity="success">Ticket Token: {contactToken}</Alert> : null}

                  <TextField
                    label="Name (optional)"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Message"
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    size="small"
                    multiline
                    minRows={2}
                    fullWidth
                  />

                  <Button variant="contained" onClick={sendSupportMessage} disabled={contactBusy}>
                    {contactBusy ? "Sending..." : contactToken ? "Send Reply" : "Start Chat"}
                  </Button>

                  <Box
                    sx={{
                      maxHeight: 180,
                      overflowY: "auto",
                      borderRadius: 2,
                      border: "1px solid rgba(255,255,255,0.12)",
                      px: 1,
                      py: 1,
                      backgroundColor: "rgba(2, 6, 23, 0.38)",
                    }}
                  >
                    {contactThread.length ? (
                      <Stack spacing={1}>
                        {contactThread.map((item) => (
                          <Box
                            key={item.id}
                            sx={{
                              p: 1,
                              borderRadius: 1.5,
                              backgroundColor: item.senderType === "ADMIN" ? "rgba(20,184,166,0.14)" : "rgba(37,99,235,0.14)",
                            }}
                          >
                            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.74)" }}>
                              {item.senderType} • {new Date(item.createdAt).toLocaleString()}
                            </Typography>
                            <Typography variant="body2" sx={{ color: "#f8fafc", whiteSpace: "pre-wrap" }}>
                              {item.body}
                            </Typography>
                          </Box>
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.66)" }}>
                        No chat messages yet.
                      </Typography>
                    )}
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}

function FeaturePill({ label }: { label: string }) {
  return (
    <Chip
      label={label}
      sx={{
        bgcolor: "rgba(255,255,255,0.08)",
        color: "common.white",
        borderRadius: 999,
        fontWeight: 700,
      }}
    />
  );
}
