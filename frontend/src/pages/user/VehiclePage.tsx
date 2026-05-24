import React from "react";
import { Box, Heading, Select, Stack, Text } from "@chakra-ui/react";
import { useTheme as useMuiTheme } from "@mui/material";
import { useParams } from "react-router-dom";
import { getDashboardUi } from "../../dashboard/uiTokens";
import IntelligenceBase from "./IntelligenceBase";

export default function VehiclePage() {
  const muiTheme = useMuiTheme();
  const ui = getDashboardUi(muiTheme.palette.mode);
  const { region } = useParams();
  const [district, setDistrict] = React.useState("");
  const titleMap: Record<string, string> = {
    islamabad: "Islamabad Excise - Vehicle Search",
    punjab: "Punjab Excise - Vehicle Search",
    sindh: "Sindh Excise - Vehicle Search",
    balochistan: "Balochistan Excise - Vehicle Search",
    kpk: "KPK Excise - Vehicle Search",
    kashmir: "Kashmir Excise - Vehicle Search",
    stolen: "Stolen Vehicle Record - Vehicle Search",
  };
  const serviceNameMap: Record<string, string> = {
    islamabad: "Islamabad Excise",
    punjab: "Punjab Excise",
    sindh: "Sindh Excise",
    balochistan: "Balochistan Excise",
    kpk: "KPK Excise",
    kashmir: "Kashmir Excise",
    stolen: "Stolen Vehicle Record",
  };
  const subtitleMap: Record<string, string> = {
    punjab: "Search with CNIC / Reg No / Engine No / Chasis No",
    islamabad: "Search with CNIC / Reg No / Engine No / Chasis No",
    sindh: "Search with CNIC / Reg No / Engine No / Chasis No",
    stolen: "Search with CNIC / Reg No / Engine No / Chasis No. This is stolen vehicle record.",
    kpk: "Search with CNIC / Reg No / Engine No / Chasis No",
    kashmir: "Search with CNIC and Registration No",
    balochistan: "Search with Registration No and District",
  };
  const title = titleMap[region ?? ""] ?? "Vehicle Search";
  const serviceName = serviceNameMap[region ?? ""] ?? "Vehicle Search";
  const subtitle = subtitleMap[region ?? ""] ?? "Search with CNIC / Reg No / Engine No / Chasis No";
  const districtOptions = [
    { value: "1", label: "QUETTA" },
    { value: "2", label: "HUB" },
    { value: "3", label: "LORALAI" },
    { value: "4", label: "SIBI" },
    { value: "5", label: "DAYAAR" },
    { value: "6", label: "NUSHKI" },
    { value: "7", label: "PISHIN" },
    { value: "8", label: "PANGOR" },
    { value: "9", label: "GAWADAR" },
    { value: "10", label: "TURBAT" },
    { value: "11", label: "ZHOB" },
    { value: "12", label: "KHUZDAR" },
    { value: "13", label: "MASTUNG" },
    { value: "14", label: "KALAT" },
    { value: "15", label: "SOHBAT PUR" },
    { value: "16", label: "JHAL MAGSI" },
    { value: "18", label: "CHAGHI" },
    { value: "19", label: "NASIRABAD" },
    { value: "20", label: "ZIARAT" },
    { value: "21", label: "QILASAIFULLAH" },
    { value: "22", label: "CHAMAN" },
    { value: "23", label: "SURAB" },
    { value: "24", label: "KILLAABDULLAH" },
    { value: "25", label: "DUKKI" },
    { value: "26", label: "BARKHAN" },
  ];

  return (
    <Box color={ui.text.primary}>
      <Stack spacing={1.5} mb={4}>
        <Heading size="lg">{title}</Heading>
        <Text color={ui.text.secondary}>{subtitle}</Text>
      </Stack>

      <IntelligenceBase
        title={title}
        serviceName={serviceName}
        placeholder="Search by CNIC, Registration No, Engine No, Chasis No..."
        description=""
        badgeLabel={null}
        showHeader={false}
        extraFields={region === "balochistan" ? (
          <Select
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            size="lg"
            borderRadius="16px"
            bg={ui.surface.input}
            border={`1px solid ${ui.surface.inputBorder}`}
            color={ui.text.primary}
            _focus={{ borderColor: "rgba(96,165,250,0.78)", boxShadow: "0 0 0 1px rgba(96,165,250,0.38)" }}
          >
            <option value="">Select District</option>
            {districtOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        ) : null}
        buildRequestParams={(normalizedQuery) =>
          region === "balochistan" && district ? { district, registrationNo: normalizedQuery } : {}
        }
        validate={(raw) => {
          const q = raw.trim();
          if (!q) return "Enter a value to search";
          if (q.length < 3) return "Search value too short";
          if (region === "balochistan" && !district) return "Select district first";
          return null;
        }}
      />
    </Box>
  );
}
