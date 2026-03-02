import { mode } from "@chakra-ui/theme-tools";

export const badgeStyles = {
  baseStyle: () => ({
    borderRadius: "full",
    px: "10px",
    py: "4px",
    fontSize: "xs",
    fontWeight: "700",
    letterSpacing: "0.2px",
    textTransform: "none",
  }),
  variants: {
    subtle: (props) => ({
      bg: mode("gray.100", "whiteAlpha.200")(props),
      color: mode("gray.700", "whiteAlpha.900")(props),
    }),
    solid: (props) => ({
      bg: mode("blue.500", "blue.400")(props),
      color: "white",
    }),
    outline: (props) => ({
      bg: "transparent",
      border: "1px solid",
      borderColor: mode("gray.300", "whiteAlpha.300")(props),
      color: mode("gray.700", "whiteAlpha.900")(props),
    }),
  },
  defaultProps: {
    variant: "subtle",
  },
};

export default badgeStyles;
