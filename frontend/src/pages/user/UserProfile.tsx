import React from "react";
import { Box, Button, Heading, HStack, Switch, Text, useToast } from "@chakra-ui/react";
import { api } from "../../app/api";
import { useAuth } from "../../app/auth/useAuth";
import { useColorMode } from "@chakra-ui/react";

export default function UserProfile() {
  const { user, refreshMe } = useAuth();
  const { colorMode, toggleColorMode } = useColorMode();
  const toast = useToast();

  async function persistTheme(next: "light" | "dark") {
    try {
      await api.post("/me/theme", { theme: next });
      await refreshMe();
    } catch {
      toast({ status: "error", title: "Failed to save theme", position: "top" });
    }
  }

  return (
    <Box>
      <Heading size="lg" mb={4}>Profile</Heading>
      <Box bg="rgba(255,255,255,0.06)" border="1px solid rgba(255,255,255,0.08)" borderRadius="18px" p={{ base: 4, md: 6 }} maxW="720px">
        <Text fontWeight="800">{user?.name ?? "User"}</Text>
        <Text opacity={0.8}>{user?.email}</Text>
        <Text mt={3} opacity={0.8}>Role: {user?.role}</Text>
        <Text opacity={0.8}>Credits: {user?.credits}</Text>

        <HStack mt={5} justify="space-between">
          <Text fontWeight="700">Dark Mode</Text>
          <Switch
            isChecked={colorMode === "dark"}
            onChange={() => {
              const next = colorMode === "dark" ? "light" : "dark";
              toggleColorMode();
              persistTheme(next);
            }}
          />
        </HStack>
      </Box>
    </Box>
  );
}
