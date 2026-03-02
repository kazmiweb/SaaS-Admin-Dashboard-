import React from "react";
import { Box, Button, Heading, HStack, Input, Tag, TagLabel, Text, useToast } from "@chakra-ui/react";
import { useParams } from "react-router-dom";
import IntelligenceBase from "./IntelligenceBase";

export default function VehiclePage() {
  const { region } = useParams();
  const titleMap: any = {
    islamabad: "Islamabad Excise",
    punjab: "Punjab Excise",
    sindh: "Sindh Excise",
    balochistan: "Balochistan Excise",
    kpk: "KPK Excise",
    kashmir: "Kashmir Excise",
    stolen: "Stolen Vehicle Records",
    "non-custom": "Non-Custom Vehicles",
  };
  const title = titleMap[region ?? ""] ?? "Vehicle Records";

  return (
    <Box>
      <HStack justify="space-between" flexWrap="wrap" gap={3} mb={4}>
        <Heading size="lg">{title}</Heading>
        <Tag colorScheme="purple" borderRadius="999px" px={4} py={2}>
          <TagLabel>Search with CNIC / Reg No / Engine No / Chasis No</TagLabel>
        </Tag>
      </HStack>

      <IntelligenceBase
        title="Vehicle Search"
        placeholder="Search by CNIC, Registration No, Engine No, Chasis No..."
        validate={(raw) => {
          const q = raw.trim();
          if (!q) return "Enter a value to search";
          if (q.length < 3) return "Search value too short";
          return null;
        }}
      />
    </Box>
  );
}
