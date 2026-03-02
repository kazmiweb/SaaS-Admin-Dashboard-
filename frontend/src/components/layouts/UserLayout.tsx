import React, { useEffect } from "react";
import { Box, Drawer, DrawerContent, DrawerOverlay, Flex, HStack, IconButton, Text, useDisclosure, Badge } from "@chakra-ui/react";
import { Outlet } from "react-router-dom";
import { FiMenu } from "react-icons/fi";
import Sidebar, { userNav } from "./Sidebar";
import { useAuth } from "../../app/auth/useAuth";
import DisclaimerModal from "../modals/DisclaimerModal";

export default function UserLayout() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { user, refreshMe } = useAuth();

  useEffect(() => { refreshMe(); }, []);

  return (
    <Flex bg="navy.900" color="white" minH="100vh">
      <Box display={{ base: "none", lg: "block" }} bg="navy.900" borderRight="1px solid rgba(255,255,255,0.08)">
        <Sidebar items={userNav} />
      </Box>

      <Drawer isOpen={isOpen} placement="left" onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent bg="navy.900">
          <Sidebar items={userNav} onNavigate={onClose} />
        </DrawerContent>
      </Drawer>

      <Box flex="1" minW={0}>
        <Flex align="center" justify="space-between" px={{ base: 4, md: 8 }} py={4} borderBottom="1px solid rgba(255,255,255,0.08)">
          <HStack spacing={3}>
            <IconButton aria-label="Open Menu" icon={<FiMenu />} display={{ base: "inline-flex", lg: "none" }} onClick={onOpen} />
            <Text fontWeight="800">Elookup</Text>
          </HStack>
          <Badge colorScheme="yellow" borderRadius="999px" px="12px" py="6px">
            Credits: {user?.credits ?? 0}
          </Badge>
        </Flex>

        <Box px={{ base: 4, md: 8 }} py={6}>
          <Outlet />
        </Box>
      </Box>

      <DisclaimerModal open={!!user && !user.acceptedDisclaimerAt} />
    </Flex>
  );
}
