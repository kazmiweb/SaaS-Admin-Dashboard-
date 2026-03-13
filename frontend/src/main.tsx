import React from "react";
import ReactDOM from "react-dom/client";
import { ChakraProvider, ColorModeScript } from "@chakra-ui/react";
import App from "./app/App";
import { AuthProvider } from "./app/auth/useAuth";
import ErrorBoundary from "./app/ErrorBoundary";
import { DashboardThemeProvider } from "./dashboard/theme";
import theme from "./vision/theme/themeAdmin";

// Vision UI fonts
import "@fontsource/raleway/400.css";
import "@fontsource/raleway/600.css";
import "@fontsource/raleway/700.css";
import "@fontsource/open-sans/400.css";
import "@fontsource/open-sans/600.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DashboardThemeProvider>
      <ChakraProvider theme={theme}>
        <ColorModeScript initialColorMode={theme.config.initialColorMode} />
        <ErrorBoundary>
          <AuthProvider><App /></AuthProvider>
        </ErrorBoundary>
      </ChakraProvider>
    </DashboardThemeProvider>
  </React.StrictMode>
);
