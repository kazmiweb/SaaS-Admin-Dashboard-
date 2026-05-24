import SendRoundedIcon from "@mui/icons-material/SendRounded";
import SupportAgentRoundedIcon from "@mui/icons-material/SupportAgentRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import React from "react";
import { api } from "../../app/api";
import { useAuth } from "../../app/auth/useAuth";
import { getDashboardUi } from "../../dashboard/uiTokens";

type Ticket = {
  id: string;
  token: string;
  subject: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  category: string;
  priority: string;
  source: string;
  contactEmail?: string | null;
  contactName?: string | null;
  lastMessageAt: string;
  lastMessagePreview?: string | null;
  messageCount: number;
  unreadCount: number;
  assignedAdmin?: { id: string; name: string; email: string } | null;
  user?: { id: string; name: string; email: string; role: string } | null;
};

type TicketMessage = {
  id: string;
  senderType: "USER" | "ADMIN" | "SYSTEM";
  body: string;
  createdAt: string;
  author?: { id: string; email: string; name: string; role: string } | null;
};

export default function EmailsInbox() {
  const { user } = useAuth();
  const theme = useTheme();
  const ui = getDashboardUi(theme.palette.mode);
  const isAdmin = user?.role === "ADMIN";

  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [activeTicketId, setActiveTicketId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<TicketMessage[]>([]);
  const [newSubject, setNewSubject] = React.useState("");
  const [newMessage, setNewMessage] = React.useState("");
  const [replyText, setReplyText] = React.useState("");
  const [statusValue, setStatusValue] = React.useState<Ticket["status"]>("OPEN");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const activeTicket = React.useMemo(() => tickets.find((item) => item.id === activeTicketId) ?? null, [tickets, activeTicketId]);
  const chatClosed = activeTicket?.status === "RESOLVED" || activeTicket?.status === "CLOSED";

  const fetchTickets = React.useCallback(async () => {
    const url = isAdmin ? "/support/admin/tickets" : "/support/my/tickets";
    const res = await api.get(url);
    const items = (res.data?.items ?? []) as Ticket[];
    setTickets(items);

    if (!items.length) {
      setActiveTicketId(null);
      setMessages([]);
      return;
    }

    setActiveTicketId((prev) => prev ?? items[0]?.id ?? null);
  }, [isAdmin]);

  const fetchMessages = React.useCallback(async (ticketId: string) => {
    const res = await api.get(`/support/tickets/${ticketId}/messages`);
    const ticket = (res.data?.ticket ?? null) as Ticket | null;
    const items = (res.data?.messages ?? []) as TicketMessage[];
    setMessages(items);
    if (ticket) {
      setStatusValue(ticket.status);
    }
  }, []);

  React.useEffect(() => {
    fetchTickets().catch((e: any) => {
      setError(e?.response?.data?.message ?? "Failed to load inbox");
    });
  }, [fetchTickets]);

  React.useEffect(() => {
    if (!activeTicketId) return;
    fetchMessages(activeTicketId).catch((e: any) => {
      setError(e?.response?.data?.message ?? "Failed to load messages");
    });
  }, [activeTicketId, fetchMessages]);

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      fetchTickets().catch(() => void 0);
      if (activeTicketId) {
        fetchMessages(activeTicketId).catch(() => void 0);
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [activeTicketId, fetchMessages, fetchTickets]);

  async function createTicket() {
    if (!newSubject.trim() || !newMessage.trim()) {
      setError("Subject and message are required.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await api.post("/support/contact", {
        subject: newSubject.trim(),
        message: newMessage.trim(),
        source: "dashboard",
      });
      const ticket = res.data?.ticket as Ticket;
      setNewSubject("");
      setNewMessage("");
      await fetchTickets();
      if (ticket?.id) {
        setActiveTicketId(ticket.id);
        await fetchMessages(ticket.id);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "Unable to create ticket");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!activeTicket || !replyText.trim()) return;
    if (chatClosed) {
      setError("This ticket is closed/resolved. New messages are disabled.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/support/tickets/${activeTicket.id}/messages`, { message: replyText.trim() });
      setReplyText("");
      await Promise.all([fetchTickets(), fetchMessages(activeTicket.id)]);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "Reply failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus() {
    if (!isAdmin || !activeTicket) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/support/admin/tickets/${activeTicket.id}/status`, { status: statusValue });
      await Promise.all([fetchTickets(), fetchMessages(activeTicket.id)]);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "Failed to update status");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={3.2}>
      <Box>
        <Typography variant="h4" sx={{ color: ui.text.primary, fontWeight: 900 }}>
          Live Support
        </Typography>
        <Typography variant="body2" sx={{ color: ui.text.secondary }}>
          Ticket based messenger workspace. Messages refresh every 5 seconds for near real-time support.
        </Typography>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Stack direction={{ xs: "column", lg: "row" }} spacing={2.5} alignItems="stretch">
        <Card sx={{ flex: 1.02, minHeight: 640 }}>
          <CardContent sx={{ p: 2.2 }}>
            <Stack spacing={2}>
              {!isAdmin ? (
                <>
                  <Box>
                    <Typography variant="h6" sx={{ color: ui.text.primary, fontWeight: 800 }}>
                      Generate Ticket
                    </Typography>
                    <Typography variant="caption" sx={{ color: ui.text.secondary }}>
                      New ticket generates a unique token for tracking.
                    </Typography>
                  </Box>

                  <TextField
                    size="small"
                    label="Subject"
                    value={newSubject}
                    onChange={(event) => setNewSubject(event.target.value)}
                    fullWidth
                  />
                  <TextField
                    size="small"
                    label="Message"
                    value={newMessage}
                    onChange={(event) => setNewMessage(event.target.value)}
                    fullWidth
                    multiline
                    minRows={3}
                  />
                  <Button variant="contained" onClick={createTicket} disabled={busy}>
                    Generate Ticket
                  </Button>

                  <Divider />
                </>
              ) : null}

              <Typography variant="subtitle2" sx={{ color: ui.text.primary, fontWeight: 800 }}>
                {isAdmin ? "All Tickets" : "My Tickets"}
              </Typography>

              <Stack spacing={1.1} sx={{ maxHeight: 420, overflowY: "auto", pr: 0.5 }}>
                {tickets.map((ticket) => (
                  <Box
                    key={ticket.id}
                    onClick={() => setActiveTicketId(ticket.id)}
                    sx={{
                      p: 1.4,
                      borderRadius: 2,
                      border: `1px solid ${ticket.id === activeTicketId ? ui.surface.borderStrong : ui.surface.border}`,
                      backgroundColor: ticket.id === activeTicketId ? ui.surface.cardStrong : ui.surface.card,
                      cursor: "pointer",
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={800} sx={{ color: ui.text.primary }} noWrap>
                          {ticket.subject}
                        </Typography>
                        <Typography variant="caption" sx={{ color: ui.text.secondary }}>
                          {ticket.token} • {new Date(ticket.lastMessageAt).toLocaleString()}
                        </Typography>
                      </Box>
                      <Stack alignItems="flex-end" spacing={0.5}>
                        <Chip size="small" label={ticket.status.replace("_", " ")} color={chipColor(ticket.status)} />
                        {ticket.unreadCount > 0 ? <Chip size="small" label={`${ticket.unreadCount} new`} color="warning" /> : null}
                      </Stack>
                    </Stack>
                    <Typography variant="caption" sx={{ color: ui.text.secondary }}>
                      {ticket.lastMessagePreview || "No preview"}
                    </Typography>
                  </Box>
                ))}

                {!tickets.length ? (
                  <Box sx={{ p: 2, borderRadius: 2, border: `1px dashed ${ui.surface.borderStrong}` }}>
                    <Typography variant="body2" sx={{ color: ui.text.secondary }}>
                      No tickets yet.
                    </Typography>
                  </Box>
                ) : null}
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1.32, minHeight: 640 }}>
          <CardContent sx={{ p: 2.2, height: "100%" }}>
            {activeTicket ? (
              <Stack spacing={2} sx={{ height: "100%" }}>
                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                  <Box>
                    <Typography variant="h6" sx={{ color: ui.text.primary, fontWeight: 900 }}>
                      {activeTicket.subject}
                    </Typography>
                    <Typography variant="caption" sx={{ color: ui.text.secondary }}>
                      Token: {activeTicket.token} • Category: {activeTicket.category}
                    </Typography>
                    {isAdmin && activeTicket.user ? (
                      <Typography variant="caption" display="block" sx={{ color: ui.text.secondary }}>
                        User: {activeTicket.user.name} ({activeTicket.user.email})
                      </Typography>
                    ) : null}
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Chip icon={<SupportAgentRoundedIcon />} label={activeTicket.status.replace("_", " ")} color={chipColor(activeTicket.status)} />
                    {isAdmin ? (
                      <>
                        <FormControl size="small" sx={{ minWidth: 150 }}>
                          <InputLabel>Status</InputLabel>
                          <Select
                            value={statusValue}
                            label="Status"
                            disabled={chatClosed || busy}
                            onChange={(event) => setStatusValue(event.target.value as Ticket["status"])}
                          >
                            <MenuItem value="OPEN">OPEN</MenuItem>
                            <MenuItem value="IN_PROGRESS">IN PROGRESS</MenuItem>
                            <MenuItem value="RESOLVED">RESOLVED</MenuItem>
                            <MenuItem value="CLOSED">CLOSED</MenuItem>
                          </Select>
                        </FormControl>
                        <Button size="small" variant="outlined" onClick={updateStatus} disabled={busy || chatClosed}>
                          Update
                        </Button>
                      </>
                    ) : null}
                  </Stack>
                </Stack>

                <Divider />

                <Stack spacing={1.4} sx={{ flex: 1, minHeight: 280, maxHeight: 420, overflowY: "auto", pr: 0.4 }}>
                  {messages.map((message) => {
                    const isMine = isAdmin ? message.senderType === "ADMIN" : message.senderType !== "ADMIN";
                    return (
                      <Box key={message.id} sx={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start" }}>
                        <Box
                          sx={{
                            maxWidth: "82%",
                            px: 1.5,
                            py: 1.2,
                            borderRadius: 2,
                            backgroundColor: isMine ? "rgba(37,99,235,0.12)" : "rgba(15,23,42,0.06)",
                            border: `1px solid ${isMine ? "rgba(37,99,235,0.35)" : ui.surface.border}`,
                          }}
                        >
                          <Typography variant="body2" sx={{ color: ui.text.primary, whiteSpace: "pre-wrap" }}>
                            {message.body}
                          </Typography>
                          <Typography variant="caption" sx={{ color: ui.text.secondary }}>
                            {message.senderType} • {new Date(message.createdAt).toLocaleString()}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>

                <Divider />

                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                  <TextField
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    placeholder={chatClosed ? "Ticket closed. Messages disabled." : isAdmin ? "Reply to user..." : "Write message for support..."}
                    fullWidth
                    multiline
                    minRows={2}
                    disabled={chatClosed}
                  />
                  <Button
                    variant="contained"
                    startIcon={<SendRoundedIcon />}
                    onClick={sendReply}
                    disabled={busy || !replyText.trim() || chatClosed}
                    sx={{ minWidth: 126 }}
                  >
                    Send
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Box sx={{ height: "100%", display: "grid", placeItems: "center" }}>
                <Typography variant="body2" sx={{ color: ui.text.secondary }}>
                  Select a ticket to start live chat.
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Stack>
  );
}

function chipColor(status: Ticket["status"]): "default" | "success" | "warning" | "info" {
  if (status === "OPEN") return "warning";
  if (status === "IN_PROGRESS") return "info";
  if (status === "RESOLVED") return "success";
  return "default";
}
