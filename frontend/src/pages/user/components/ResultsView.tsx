import React from "react";
import { Badge, Box, Button, Divider, Grid, GridItem, Heading, HStack, Image, Modal, ModalBody, ModalContent, ModalOverlay, Stack, Text, useDisclosure, VStack } from "@chakra-ui/react";
import { mergeResults, collectImages, UnifiedResult } from "./merge";
import { downloadClientPdf, downloadCsv } from "../../../utils/export";

function JsonBlock({ data }: { data: any }) {
  return (
    <Box as="pre" fontSize="xs" p="12px" bg="rgba(0,0,0,0.35)" borderRadius="12px" overflow="auto" maxH="260px">
      {JSON.stringify(data, null, 2)}
    </Box>
  );
}

export default function ResultsView({
  query,
  results,
  onExportPdf,
}: {
  query: string;
  results: UnifiedResult[];
  onExportPdf?: () => void;
}) {
  const merged = mergeResults(results);
  const anyOk = results.some(r => r.ok);

  if (!anyOk) {
    return <Text textAlign="center" color="red.300" fontWeight="700" mt={10}>Server Error / API Offline</Text>;
  }

  return (
    <Stack spacing={8} mt={8}>
      <HStack justify="space-between" flexWrap="wrap" gap={3}>
        <Heading size="md">Results</Heading>
        <HStack>
          {onExportPdf ? (
            <Button colorScheme="green" borderRadius="999px" onClick={onExportPdf}>
              Print / Download PDF
            </Button>
          ) : null}
          <Button
            borderRadius="999px"
            onClick={() =>
              downloadClientPdf({
                filename: `${query || "elookup"}-client.pdf`,
                title: "Elookup Intelligence Report",
                subtitle: `Query: ${query}`,
                sections: [{ heading: "Merged Records", rows: merged.map((m) => ({ ...m.merged, sourceApis: m.sources })) }],
                rawJson: results,
              })
            }
          >
            Client PDF
          </Button>
          <Button
            borderRadius="999px"
            onClick={() =>
              downloadCsv(`${query || "elookup"}-results.csv`, merged.map((m) => ({ ...m.merged, sourceApis: m.sources.join(";") })))
            }
          >
            CSV
          </Button>
          <Button borderRadius="999px" onClick={() => navigator.clipboard.writeText(JSON.stringify(results, null, 2))}>
            Copy JSON
          </Button>
        </HStack>
      </HStack>

      {merged.map((g, idx) => (
        <Box key={g.key} bg="rgba(255,255,255,0.06)" border="1px solid rgba(255,255,255,0.08)" borderRadius="18px" p={{ base: 4, md: 6 }}>
          <HStack justify="space-between" align="start" flexWrap="wrap" gap={3}>
            <Box>
              <Heading size="sm" mb={1}>Record #{idx + 1}</Heading>
              <Text fontSize="sm" opacity={0.85}>Query: {query}</Text>
            </Box>
            <HStack flexWrap="wrap">
              {g.sources.map(s => (
                <Badge key={s} colorScheme="blue" borderRadius="999px" px={3} py={1}>{s}</Badge>
              ))}
            </HStack>
          </HStack>

          <Divider my={4} borderColor="rgba(255,255,255,0.10)" />

          <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={6}>
            <GridItem>
              <Heading size="xs" mb={2} opacity={0.9}>Details</Heading>
              <JsonBlock data={g.merged} />
            </GridItem>

            <GridItem>
              <Heading size="xs" mb={2} opacity={0.9}>Images</Heading>
              <ImageGallery images={collectImages(g.merged)} />
            </GridItem>
          </Grid>
        </Box>
      ))}
    </Stack>
  );
}

function ImageGallery({ images }: { images: string[] }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [active, setActive] = React.useState<string | null>(null);

  if (!images.length) return <Text fontSize="sm" opacity={0.7}>No Images</Text>;

  return (
    <>
      <Grid templateColumns="repeat(3, 1fr)" gap={3}>
        {images.slice(0, 9).map((src) => (
          <Box key={src} borderRadius="14px" overflow="hidden" cursor="pointer" onClick={() => { setActive(src); onOpen(); }}>
            <Image src={src} alt="img" objectFit="cover" w="full" h="90px" />
          </Box>
        ))}
      </Grid>

      <Modal isOpen={isOpen} onClose={onClose} isCentered size="xl">
        <ModalOverlay />
        <ModalContent bg="navy.900" border="1px solid rgba(255,255,255,0.12)">
          <ModalBody p={3}>
            {active ? <Image src={active} alt="full" w="full" borderRadius="14px" /> : null}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
