import React from "react";
import {
  Box,
  Flex,
  Icon,
  Text,
  VStack,
  HStack,
  Button,
  Collapse,
  useDisclosure,
  Avatar,
} from "@chakra-ui/react";
import { NavLink } from "react-router-dom";
import { FiHome, FiServer, FiUsers, FiShield, FiActivity, FiDollarSign, FiSearch, FiPhone, FiCreditCard, FiSettings, FiTruck, FiGitBranch, FiKey } from "react-icons/fi";
import { useAuth } from "../../app/auth/useAuth";

type Item = { label: string; to?: string; icon: any; children?: Item[] };

function LinkItem({ item, onNavigate }: { item: Item; onNavigate?: () => void }) {
  const { isOpen, onToggle } = useDisclosure();
  const hasChildren = !!item.children?.length;

  return (
    <Box w="full">
      <Flex
        as={hasChildren ? "button" : (NavLink as any)}
        to={hasChildren ? undefined : item.to}
        onClick={() => {
          if (hasChildren) onToggle();
          else onNavigate?.();
        }}
        align="center"
        justify="space-between"
        w="full"
        px="12px"
        py="10px"
        borderRadius="12px"
        _hover={{ bg: "rgba(255,255,255,0.06)" }}
        _activeLink={{ bg: "rgba(255,255,255,0.10)" }}
      >
        <HStack spacing={3}>
          <Icon as={item.icon} boxSize="18px" />
          <Text fontSize="sm" fontWeight="600">
            {item.label}
          </Text>
        </HStack>
        {hasChildren ? <Text fontSize="lg">{isOpen ? "▾" : "▸"}</Text> : null}
      </Flex>

      {hasChildren ? (
        <Collapse in={isOpen} animateOpacity>
          <VStack align="start" pl="36px" pr="8px" py="6px" spacing={1}>
            {item.children!.map((c) => (
              <Flex
                key={c.to}
                as={NavLink as any}
                to={c.to!}
                onClick={onNavigate}
                w="full"
                px="10px"
                py="8px"
                borderRadius="10px"
                fontSize="sm"
                _hover={{ bg: "rgba(255,255,255,0.06)" }}
                _activeLink={{ bg: "rgba(255,255,255,0.10)" }}
              >
                <HStack spacing={3}>
                  <Icon as={c.icon} boxSize="16px" />
                  <Text>{c.label}</Text>
                </HStack>
              </Flex>
            ))}
          </VStack>
        </Collapse>
      ) : null}
    </Box>
  );
}

export default function Sidebar({
  items,
  onNavigate,
}: {
  items: Item[];
  onNavigate?: () => void;
}) {
  const { user } = useAuth();

  return (
    <Flex direction="column" h="100vh" w="290px" px="14px" py="16px">
      {/* Logo */}
      <HStack px="10px" pb="14px" spacing={2}>
        <Text fontSize="2xl" fontWeight="800" letterSpacing="0.5px">
          Elookup
        </Text>
        <Box bg="red.500" color="white" px="10px" py="3px" borderRadius="999px" fontSize="xs" fontWeight="800">
          DB
        </Box>
      </HStack>

      {/* Profile */}
      <Flex
        px="12px"
        py="12px"
        borderRadius="16px"
        bg="rgba(255,255,255,0.06)"
        align="center"
        gap={3}
        mb="12px"
      >
        <Avatar size="sm" name={user?.name ?? user?.email ?? "User"} />
        <Box minW={0}>
          <Text fontSize="sm" fontWeight="700" isTruncated>
            {user?.name ?? "User"}
          </Text>
          <Text fontSize="xs" opacity={0.8} isTruncated>
            {user?.email ?? ""}
          </Text>
        </Box>
      </Flex>

      {/* Menu (no scroll inside sidebar) */}
      <VStack align="stretch" spacing={1} flex="1" overflow="hidden">
        {items.map((it) => (
          <LinkItem key={it.label} item={it} onNavigate={onNavigate} />
        ))}
      </VStack>

      {/* Footer */}
      <Box pt="10px">
        <LogoutButton />
      </Box>
    </Flex>
  );
}

function LogoutButton() {
  const { logout } = useAuth();
  return (
    <Button w="full" colorScheme="red" borderRadius="14px" onClick={logout}>
      Logout
    </Button>
  );
}

export const adminNav: Item[] = [
  { label: "Dashboard", to: "/admin/dashboard", icon: FiHome },
  { label: "API Management", to: "/admin/api-management", icon: FiServer },
  { label: "User Management", to: "/admin/user-management", icon: FiUsers },
  { label: "Transaction / Revenue", to: "/admin/transactions", icon: FiDollarSign },
  { label: "Security", to: "/admin/security", icon: FiShield },
  { label: "Activity Logs", to: "/admin/activity-logs", icon: FiActivity },
];

export const userNav: Item[] = [
  { label: "Dashboard", to: "/user/dashboard", icon: FiHome },
  { label: "Search All in One", to: "/user/cnic-intelligence", icon: FiSearch },
  { label: "CNIC Intelligence", to: "/user/cnic-intelligence", icon: FiCreditCard },
  { label: "Mobile Intelligence", to: "/user/mobile-intelligence", icon: FiPhone },
  {
    label: "Vehicle Records",
    icon: FiTruck,
    children: [
      { label: "Islamabad Excise", to: "/user/vehicle/islamabad", icon: FiTruck },
      { label: "Punjab Excise", to: "/user/vehicle/punjab", icon: FiTruck },
      { label: "Sindh Excise", to: "/user/vehicle/sindh", icon: FiTruck },
      { label: "Balochistan Excise", to: "/user/vehicle/balochistan", icon: FiTruck },
      { label: "KPK Excise", to: "/user/vehicle/kpk", icon: FiTruck },
      { label: "Kashmir Excise", to: "/user/vehicle/kashmir", icon: FiTruck },
      { label: "Stolen Vehicles", to: "/user/vehicle/stolen", icon: FiTruck },
      { label: "Non-Custom Vehicles", to: "/user/vehicle/non-custom", icon: FiTruck },
    ],
  },
  { label: "Mix Family Tree", to: "/user/family-tree", icon: FiGitBranch },
  {
    label: "Settings",
    icon: FiSettings,
    children: [
      { label: "My Searches", to: "/user/settings/searches", icon: FiSearch },
      { label: "Transaction History", to: "/user/settings/transactions", icon: FiDollarSign },
      { label: "Change Password", to: "/user/settings/change-password", icon: FiKey },
    ],
  },
];

export const resellerNav: Item[] = [
  { label: "Dashboard", to: "/reseller/dashboard", icon: FiHome },
  { label: "Search All in One", to: "/reseller/cnic-intelligence", icon: FiSearch },
  { label: "CNIC Intelligence", to: "/reseller/cnic-intelligence", icon: FiCreditCard },
  { label: "Mobile Intelligence", to: "/reseller/mobile-intelligence", icon: FiPhone },
  {
    label: "Vehicle Records",
    icon: FiTruck,
    children: [
      { label: "Islamabad Excise", to: "/reseller/vehicle/islamabad", icon: FiTruck },
      { label: "Punjab Excise", to: "/reseller/vehicle/punjab", icon: FiTruck },
      { label: "Sindh Excise", to: "/reseller/vehicle/sindh", icon: FiTruck },
      { label: "Balochistan Excise", to: "/reseller/vehicle/balochistan", icon: FiTruck },
      { label: "KPK Excise", to: "/reseller/vehicle/kpk", icon: FiTruck },
      { label: "Kashmir Excise", to: "/reseller/vehicle/kashmir", icon: FiTruck },
      { label: "Stolen Vehicles", to: "/reseller/vehicle/stolen", icon: FiTruck },
      { label: "Non-Custom Vehicles", to: "/reseller/vehicle/non-custom", icon: FiTruck },
    ],
  },
  { label: "Mix Family Tree", to: "/reseller/family-tree", icon: FiGitBranch },
  { label: "User Management", to: "/reseller/users", icon: FiUsers },
  {
    label: "Settings",
    icon: FiSettings,
    children: [
      { label: "My Searches", to: "/reseller/settings/searches", icon: FiSearch },
      { label: "Transaction History", to: "/reseller/settings/transactions", icon: FiDollarSign },
      { label: "Change Password", to: "/reseller/settings/change-password", icon: FiKey },
    ],
  },
];
