import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../../app/api";
import { useAuth } from "../../app/auth/useAuth";
import { useDashboardTheme } from "../../dashboard/theme";
import { getDashboardUi } from "../../dashboard/uiTokens";
import {
  extractCooldownSeconds,
  extractExpiresInSeconds,
  extractRetryAfterSeconds,
  normalizeEmailInput,
  normalizeOtpInput,
} from "../../utils/otp";

function safeDate(value?: string | null) {
  if (!value) return "No expiry";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "No expiry" : parsed.toLocaleDateString();
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Invalid image."));
    image.src = dataUrl;
  });
}

async function optimizeImageForProfile(file: File) {
  const original = await readFileAsDataUrl(file);
  // Keep request payload under backend JSON/body and profile image limits.
  if (original.length <= 380_000) return original;

  const image = await loadImage(original);
  const maxSize = 720;
  let width = image.width;
  let height = image.height;
  if (width > maxSize || height > maxSize) {
    const ratio = Math.min(maxSize / width, maxSize / height);
    width = Math.max(64, Math.floor(width * ratio));
    height = Math.max(64, Math.floor(height * ratio));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing failed.");
  ctx.drawImage(image, 0, 0, width, height);

  let quality = 0.85;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > 380_000 && quality > 0.4) {
    quality -= 0.1;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  return out;
}

export default function UserProfile() {
  const { user, refreshMe } = useAuth();
  const { mode, setMode } = useDashboardTheme();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const theme = useTheme();
  const ui = getDashboardUi(theme.palette.mode);

  const [profileImage, setProfileImage] = useState<string>("");

  const [newEmail, setNewEmail] = useState("");
  const [emailUpdatePassword, setEmailUpdatePassword] = useState("");
  const [emailUpdateBusy, setEmailUpdateBusy] = useState(false);

  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [twoFaSaving, setTwoFaSaving] = useState(false);

  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetOtpSent, setResetOtpSent] = useState(false);
  const [resetOtpBusy, setResetOtpBusy] = useState(false);
  const [resetOtpCooldownLeft, setResetOtpCooldownLeft] = useState(0);
  const [resetOtpExpiresInLeft, setResetOtpExpiresInLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    setProfileImage(user.profileImageData ?? "");
    setNewEmail(user.email ?? "");
    setResetEmail(user.email ?? "");
    setTwoFaEnabled(Boolean(user.twoFactorEnabled));
  }, [user]);

  useEffect(() => {
    if (resetOtpCooldownLeft <= 0 && (!resetOtpExpiresInLeft || resetOtpExpiresInLeft <= 0)) {
      return;
    }
    const timer = window.setInterval(() => {
      setResetOtpCooldownLeft((prev) => (prev > 0 ? prev - 1 : 0));
      setResetOtpExpiresInLeft((prev) => {
        if (prev === null) return prev;
        return prev > 0 ? prev - 1 : 0;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resetOtpCooldownLeft, resetOtpExpiresInLeft]);

  function applyResetOtpMeta(data: any) {
    const cooldown = extractCooldownSeconds(data);
    if (cooldown) setResetOtpCooldownLeft(cooldown);
    const expiresIn = extractExpiresInSeconds(data);
    if (expiresIn) setResetOtpExpiresInLeft(expiresIn);
  }

  async function persistTheme(next: "light" | "dark") {
    try {
      setError("");
      await api.post("/me/theme", { theme: next });
      await refreshMe();
      setSuccess("Theme updated.");
    } catch {
      setError("Failed to save theme preference.");
    }
  }

  async function uploadProfileImage(file: File | null) {
    if (!file) return;
    try {
      setError("");
      setSuccess("");
      const imageData = await optimizeImageForProfile(file);
      await api.post("/me/profile-image", { imageData });
      await refreshMe();
      setProfileImage(imageData);
      setSuccess("Profile image updated.");
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to upload profile image.");
    }
  }

  async function updateEmail() {
    const normalizedEmail = normalizeEmailInput(newEmail);
    setNewEmail(normalizedEmail);
    if (!emailUpdatePassword.trim()) {
      setError("Current password is required.");
      return;
    }
    setEmailUpdateBusy(true);
    try {
      setError("");
      setSuccess("");
      await api.post("/me/email-update", {
        newEmail: normalizedEmail,
        currentPassword: emailUpdatePassword,
      });
      setEmailUpdatePassword("");
      setResetEmail(normalizedEmail);
      await refreshMe();
      setSuccess("Email updated successfully.");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to update email.");
    } finally {
      setEmailUpdateBusy(false);
    }
  }

  async function removeProfileImage() {
    try {
      setError("");
      setSuccess("");
      await api.delete("/me/profile-image");
      await refreshMe();
      setProfileImage("");
      setSuccess("Profile image removed.");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to remove profile image.");
    }
  }

  async function toggleTwoFa(value: boolean) {
    if (twoFaSaving) return;
    try {
      setError("");
      setSuccess("");
      setTwoFaSaving(true);
      await api.post("/me/2fa", { enabled: value });
      setTwoFaEnabled(value);
      await refreshMe();
      setSuccess(value ? "2-factor authentication enabled." : "2-factor authentication disabled.");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to update 2FA setting.");
      setTwoFaEnabled(Boolean(user?.twoFactorEnabled));
    } finally {
      setTwoFaSaving(false);
    }
  }

  async function requestPasswordResetOtp() {
    const normalizedEmail = normalizeEmailInput(resetEmail);
    setResetEmail(normalizedEmail);
    setResetOtpBusy(true);
    try {
      setError("");
      setSuccess("");
      const resp = await api.post("/auth/password-reset/request", { email: normalizedEmail });
      applyResetOtpMeta(resp?.data);
      setResetOtpSent(true);
      setSuccess("Password reset OTP sent.");
    } catch (e: any) {
      const waitSeconds = extractRetryAfterSeconds(e);
      if (waitSeconds) setResetOtpCooldownLeft(waitSeconds);
      setError(e?.response?.data?.message || "Failed to send password reset OTP.");
    } finally {
      setResetOtpBusy(false);
    }
  }

  async function verifyPasswordResetOtp() {
    const normalizedEmail = normalizeEmailInput(resetEmail);
    const normalizedOtp = normalizeOtpInput(resetOtp);
    setResetEmail(normalizedEmail);
    setResetOtp(normalizedOtp);
    setResetOtpBusy(true);
    try {
      setError("");
      setSuccess("");
      await api.post("/auth/password-reset/verify", {
        email: normalizedEmail,
        otp: normalizedOtp,
        newPassword: resetNewPassword,
      });
      setResetOtp("");
      setResetNewPassword("");
      setResetOtpSent(false);
      setResetOtpCooldownLeft(0);
      setResetOtpExpiresInLeft(null);
      setSuccess("Password updated successfully.");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to verify password reset OTP.");
    } finally {
      setResetOtpBusy(false);
    }
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" sx={{ color: ui.text.primary }}>Profile</Typography>
        <Typography sx={{ color: ui.text.secondary }}>Account details and security settings.</Typography>
      </Stack>

      {error ? <Alert severity="warning" onClose={() => setError("")}>{error}</Alert> : null}
      {success ? <Alert severity="success" onClose={() => setSuccess("")}>{success}</Alert> : null}

      <Card sx={{ maxWidth: 920, mx: "auto", background: ui.surface.cardStrong, border: `1px solid ${ui.surface.borderStrong}` }}>
        <CardContent>
          <Stack spacing={3}>
            <Stack spacing={2} alignItems="center" textAlign="center">
              <Avatar
                src={profileImage || undefined}
                sx={{
                  width: { xs: 108, md: 136 },
                  height: { xs: 108, md: 136 },
                  fontSize: { xs: 40, md: 52 },
                  background: theme.palette.mode === "dark"
                    ? "linear-gradient(135deg, #dc2626 0%, #f97316 100%)"
                    : "linear-gradient(135deg, #ef4444 0%, #fb7185 100%)",
                  color: "#fff",
                }}
              >
                {user?.name?.[0] ?? user?.email?.[0] ?? "U"}
              </Avatar>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button variant="outlined" component="label">
                  {profileImage ? "Update Profile Image" : "Add Profile Image"}
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    onChange={(event) => uploadProfileImage(event.target.files?.[0] ?? null)}
                  />
                </Button>
                {profileImage ? (
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => {
                      if (!user) return;
                      removeProfileImage().catch(() => void 0);
                    }}
                  >
                    Remove Image
                  </Button>
                ) : null}
              </Stack>

              <Typography variant="h5" sx={{ color: ui.text.primary }}>{user?.name ?? "User"}</Typography>
              <Typography sx={{ color: ui.text.secondary }}>{user?.email}</Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} justifyContent="center" alignItems="center" useFlexGap flexWrap="wrap">
                <Box sx={{ px: 1.5, py: 0.75, borderRadius: 999, backgroundColor: ui.surface.hover, border: `1px solid ${ui.surface.border}`, color: ui.text.primary, fontSize: "0.875rem", fontWeight: 700 }}>
                  Credits: {user?.credits ?? 0}
                </Box>
                <Box sx={{ px: 1.5, py: 0.75, borderRadius: 999, backgroundColor: ui.surface.hover, border: `1px solid ${ui.surface.border}`, color: ui.text.primary, fontSize: "0.875rem", fontWeight: 700 }}>
                  Expiry: {safeDate(user?.expireAt)}
                </Box>
                <Box sx={{ px: 1.5, py: 0.75, borderRadius: 999, backgroundColor: ui.surface.hover, border: `1px solid ${ui.surface.border}`, color: ui.text.primary, fontSize: "0.875rem", fontWeight: 700 }}>
                  Status: {user?.status ?? "ACTIVE"}
                </Box>
              </Stack>
            </Stack>

            <Divider />

            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={2}>
              <Stack spacing={0.5}>
                <Typography fontWeight={800} sx={{ color: ui.text.primary }}>Dashboard Theme</Typography>
                <Typography variant="body2" sx={{ color: ui.text.secondary }}>
                  Toggle dashboard appearance.
                </Typography>
              </Stack>
              <FormControlLabel
                control={
                  <Switch
                    checked={mode === "dark"}
                    onChange={async () => {
                      const next = mode === "dark" ? "light" : "dark";
                      setMode(next);
                      await persistTheme(next);
                    }}
                  />
                }
                label={mode === "dark" ? "Dark mode" : "Light mode"}
                sx={{ color: ui.text.primary }}
              />
            </Stack>

            <Divider />

            <Stack spacing={1.5}>
              <Typography fontWeight={800} sx={{ color: ui.text.primary }}>Update Email</Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
                <TextField label="New Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} fullWidth />
                <TextField
                  label="Current Password"
                  type="password"
                  value={emailUpdatePassword}
                  onChange={(e) => setEmailUpdatePassword(e.target.value)}
                  fullWidth
                />
                <Button
                  variant="contained"
                  onClick={updateEmail}
                  disabled={emailUpdateBusy || !newEmail.trim() || !emailUpdatePassword.trim()}
                >
                  Update Email
                </Button>
              </Stack>
            </Stack>

            <Divider />

            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={2}>
              <Stack spacing={0.5}>
                <Typography fontWeight={800} sx={{ color: ui.text.primary }}>2 Factor Authentication</Typography>
                <Typography variant="body2" sx={{ color: ui.text.secondary }}>
                  Enable extra account protection.
                </Typography>
              </Stack>
              <FormControlLabel
                control={<Switch checked={twoFaEnabled} onChange={(event) => toggleTwoFa(event.target.checked)} disabled={twoFaSaving} />}
                label={twoFaEnabled ? "Enabled" : "Disabled"}
              />
            </Stack>

            <Divider />

            <Stack spacing={1.5}>
              <Typography fontWeight={800} sx={{ color: ui.text.primary }}>Reset Password By Email</Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
                <TextField label="Email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} fullWidth />
                {!resetOtpSent ? (
                  <Button variant="contained" onClick={requestPasswordResetOtp} disabled={resetOtpBusy || resetOtpCooldownLeft > 0}>
                    {resetOtpCooldownLeft > 0 ? `Send OTP in ${resetOtpCooldownLeft}s` : "Send OTP"}
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    onClick={verifyPasswordResetOtp}
                    disabled={resetOtpBusy || resetOtp.length !== 6 || resetNewPassword.trim().length < 8}
                  >
                    Verify & Reset
                  </Button>
                )}
              </Stack>
              {resetOtpSent ? (
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
                  <TextField label="OTP" value={resetOtp} onChange={(e) => setResetOtp(normalizeOtpInput(e.target.value))} fullWidth />
                  <TextField label="New Password" type="password" value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} fullWidth />
                  <Button
                    variant="outlined"
                    onClick={requestPasswordResetOtp}
                    disabled={resetOtpBusy || resetOtpCooldownLeft > 0}
                  >
                    {resetOtpCooldownLeft > 0 ? `Resend in ${resetOtpCooldownLeft}s` : "Resend OTP"}
                  </Button>
                </Stack>
              ) : null}
              {resetOtpExpiresInLeft && resetOtpExpiresInLeft > 0 ? (
                <Typography variant="body2" sx={{ color: ui.text.secondary }}>
                  OTP expires in {Math.ceil(resetOtpExpiresInLeft / 60)}m {resetOtpExpiresInLeft % 60}s.
                </Typography>
              ) : null}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
