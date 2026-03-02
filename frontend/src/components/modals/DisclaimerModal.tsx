import React, { useState } from "react";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Checkbox,
  Button,
  Text,
  Box,
} from "@chakra-ui/react";
import { api } from "../../app/api";
import { useAuth } from "../../app/auth/useAuth";

export default function DisclaimerModal({ open }: { open: boolean }) {
  const { refreshMe } = useAuth();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  async function accept() {
    setSaving(true);
    try {
      await api.post("/me/accept-disclaimer", {});
      await refreshMe();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={open} onClose={() => {}} isCentered closeOnOverlayClick={false} closeOnEsc={false}>
      <ModalOverlay />
      <ModalContent bg="navy.900" color="white" borderRadius="18px" border="1px solid rgba(255,255,255,0.10)">
        <ModalHeader>LEGAL NOTICE & DISCLAIMER</ModalHeader>
        <ModalBody>
          <Box fontSize="sm" opacity={0.92} lineHeight="1.6">
            <Text fontWeight="700">THIS WEBSITE IS STRICTLY FOR LAW ENFORCEMENT DEPARTMENTS AND AUTHORIZED PERSONNEL ONLY.</Text>
            <Text mt={3}>
              ⚠️ WARNING: Misuse of this system for illegal activities, harassment, or unauthorized purposes is strictly prohibited and may result in criminal prosecution.
            </Text>
            <Text mt={3}>
              By accessing and using this system, you acknowledge that you are solely responsible for your actions and any consequences arising from misuse.
            </Text>
          </Box>

          <Checkbox mt={4} isChecked={checked} onChange={(e) => setChecked(e.target.checked)}>
            I UNDERSTAND AND AGREE TO THE TERMS
          </Checkbox>
        </ModalBody>
        <ModalFooter>
          <Button colorScheme="blue" isDisabled={!checked} isLoading={saving} onClick={accept} w="full" borderRadius="14px">
            Continue
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
