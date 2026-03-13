import React, { useState } from "react";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import TelegramIcon from "@mui/icons-material/Telegram";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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

const QUICK_TEMPLATES = [
  "I need login access. Please help me register my account.",
  "My device is locked. Please reset my device binding.",
  "Please share your latest pricing and subscription rates.",
  "Open chat support",
] as const;

export default function Login() {
  const nav = useNavigate();
  const telegramUrl = import.meta.env.VITE_TELEGRAM_URL || "https://t.me/elookup_support";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showReset, setShowReset] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [resetEmail, setResetEmail] = useState("");

  const [chatOpen, setChatOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
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
        setErr(ex?.response?.data?.message ?? "This account is currently bound to another device.");
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
      // Silent polling failure handling
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
          phone: contactPhone.trim() || undefined,
          email: contactEmail.trim(),
          subject: "Login access support request",
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
          phone: contactPhone.trim() || undefined,
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
    if (!chatOpen || !contactToken || !contactEmail.trim()) return;
    loadSupportThread(contactToken, contactEmail.trim()).catch(() => void 0);
    const timer = window.setInterval(() => {
      loadSupportThread(contactToken, contactEmail.trim()).catch(() => void 0);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [chatOpen, contactToken, contactEmail]);

  function openChat() {
    setContactEmail((prev) => prev || email);
    setChatOpen(true);
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: { xs: 2, md: 4 },
        py: { xs: 4, md: 6 },
        background:
          "radial-gradient(circle at top left, rgba(37,99,235,0.22), transparent 28%), radial-gradient(circle at bottom right, rgba(20,184,166,0.2), transparent 24%), linear-gradient(135deg, #071120 0%, #0f172a 46%, #134e4a 100%)",
      }}
    >
      <Grid container justifyContent="center">
        <Grid item xs={12} sm={10} md={7} lg={4.5}>
          <Card
            sx={{
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.08)",
              bgcolor: "rgba(9,16,32,0.9)",
              backdropFilter: "blur(14px)",
              boxShadow: "0 24px 90px rgba(0,0,0,0.28)",
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 4 } }}>
              <Stack spacing={2.5} textAlign="center">
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 900 }}>
                    Login
                  </Typography>
                  <Typography color="text.secondary" sx={{ mt: 0.6 }}>
                    Use your existing account credentials. Access is routed by backend role.
                  </Typography>
                </Box>

                {err ? <Alert severity="error">{err}</Alert> : null}

                {showReset ? (
                  <Stack spacing={2.2} textAlign="left">
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        Reset bound device
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
                        Send OTP to your registered email, then verify to replace the current device.
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

                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.4}>
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
                    <Stack spacing={2.2}>
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

                <Typography variant="body2" color="text.secondary">
                  New user?{" "}
                  <MuiLink component={Link} to="/signup" underline="hover">
                    Create account
                  </MuiLink>
                </Typography>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} pt={0.5}>
                  <Button
                    variant="outlined"
                    color="inherit"
                    fullWidth
                    startIcon={<ChatRoundedIcon />}
                    onClick={openChat}
                  >
                    Contact Admin
                  </Button>
                  <Button
                    variant="outlined"
                    color="info"
                    fullWidth
                    startIcon={<TelegramIcon />}
                    component="a"
                    href={telegramUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Telegram
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={chatOpen} onClose={() => setChatOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>Contact Admin Chat</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.6}>
            <Typography variant="body2" color="text.secondary">
              Share your issue and our admin team will respond on this complaint thread.
            </Typography>

            {contactErr ? <Alert severity="error">{contactErr}</Alert> : null}
            {contactToken ? <Alert severity="success">Complaint Token: {contactToken}</Alert> : null}

            <TextField
              label="Email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Name (optional)"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              fullWidth
            />
            <TextField
              label="Phone (optional)"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              fullWidth
            />

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {QUICK_TEMPLATES.map((template) => (
                <Button
                  key={template}
                  variant="text"
                  size="small"
                  onClick={() => setContactMessage(template)}
                >
                  {template}
                </Button>
              ))}
            </Stack>

            <TextField
              label="Message"
              value={contactMessage}
              onChange={(e) => setContactMessage(e.target.value)}
              multiline
              minRows={3}
              fullWidth
            />

            <Box
              sx={{
                maxHeight: 220,
                overflowY: "auto",
                borderRadius: 2,
                border: "1px solid rgba(15,23,42,0.15)",
                px: 1.2,
                py: 1,
                backgroundColor: "rgba(2, 6, 23, 0.03)",
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
                        backgroundColor: item.senderType === "ADMIN" ? "rgba(20,184,166,0.12)" : "rgba(37,99,235,0.1)",
                      }}
                    >
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {item.senderType} • {new Date(item.createdAt).toLocaleString()}
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                        {item.body}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  No messages yet.
                </Typography>
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.4 }}>
          <Button onClick={() => setChatOpen(false)} color="inherit">
            Close
          </Button>
          <Button
            variant="contained"
            startIcon={<SendRoundedIcon />}
            onClick={sendSupportMessage}
            disabled={contactBusy}
          >
            {contactBusy ? "Sending..." : contactToken ? "Send Reply" : "Start Chat"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
