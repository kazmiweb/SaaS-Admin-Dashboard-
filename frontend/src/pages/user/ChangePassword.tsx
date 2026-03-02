import React, { useState } from "react";
import { Box, Button, Heading, Input, Stack, useToast } from "@chakra-ui/react";
import { api } from "../../app/api";

export default function ChangePassword() {
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
    <Box>
      <Heading size="lg" mb={4}>Change Password</Heading>
      <Box bg="rgba(255,255,255,0.06)" border="1px solid rgba(255,255,255,0.08)" borderRadius="18px" p={{ base: 4, md: 6 }} maxW="520px">
        <Stack spacing={4}>
          <Input type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} borderRadius="14px" />
          <Input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNew(e.target.value)} borderRadius="14px" />
          <Button colorScheme="blue" borderRadius="999px" onClick={save} isLoading={saving}>Update</Button>
        </Stack>
      </Box>
    </Box>
  );
}
