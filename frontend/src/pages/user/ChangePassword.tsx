import React, { useState } from "react";
import { Box, Button, Heading, Input, Stack, useToast } from "@chakra-ui/react";
import { useTheme as useMuiTheme } from "@mui/material";
import { api } from "../../app/api";
import { getDashboardUi } from "../../dashboard/uiTokens";

export default function ChangePassword() {
  const muiTheme = useMuiTheme();
  const ui = getDashboardUi(muiTheme.palette.mode);
  const toast = useToast();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (newPassword.length < 8) {
      toast({ status: "error", title: "New password must be at least 8 characters", position: "top" });
      return;
    }
    setSaving(true);
    try {
      await api.post("/me/change-password", { currentPassword, newPassword });
      setCurrent("");
      setNew("");
      toast({ status: "success", title: "Password updated", position: "top" });
    } catch (e: any) {
      toast({ status: "error", title: e?.response?.data?.message || "Failed", position: "top" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box color={ui.text.primary}>
      <Heading size="lg" mb={4}>Change Password</Heading>
      <Box bg={ui.surface.card} border={`1px solid ${ui.surface.border}`} borderRadius="18px" p={{ base: 4, md: 6 }} maxW="520px">
        <Stack spacing={4}>
          <Input type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} borderRadius="14px" bg={ui.surface.input} border={`1px solid ${ui.surface.inputBorder}`} color={ui.text.primary} _placeholder={{ color: ui.text.muted }} />
          <Input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNew(e.target.value)} borderRadius="14px" bg={ui.surface.input} border={`1px solid ${ui.surface.inputBorder}`} color={ui.text.primary} _placeholder={{ color: ui.text.muted }} />
          <Button colorScheme="blue" borderRadius="999px" onClick={save} isLoading={saving}>Update</Button>
        </Stack>
      </Box>
    </Box>
  );
}
