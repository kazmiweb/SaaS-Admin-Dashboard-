import React, { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/useAuth";
import ProtectedRoute from "./routes/ProtectedRoute";
import RoleRedirect from "./routes/RoleRedirect";

const CHUNK_RELOAD_SESSION_KEY = "__elookup_chunk_reload_once__";

function isChunkLoadError(error: unknown) {
  const name = typeof error === "object" && error && "name" in error ? String((error as any).name) : "";
  const message = typeof error === "object" && error && "message" in error ? String((error as any).message) : String(error ?? "");
  const haystack = `${name} ${message}`.toLowerCase();
  return (
    haystack.includes("chunkloaderror") ||
    haystack.includes("failed to fetch dynamically imported module") ||
    haystack.includes("importing a module script failed") ||
    haystack.includes("loading chunk")
  );
}

function lazyRetry<T extends React.ComponentType<any>>(importer: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const module = await importer();
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(CHUNK_RELOAD_SESSION_KEY);
      }
      return module;
    } catch (error) {
      if (typeof window !== "undefined" && isChunkLoadError(error)) {
        const reloadedAlready = window.sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY) === "1";
        if (!reloadedAlready) {
          window.sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, "1");
          window.location.reload();
          return new Promise<{ default: T }>(() => {});
        }
      }
      throw error;
    }
  });
}

const Login = lazyRetry(() => import("../pages/Login"));
const Signup = lazyRetry(() => import("../pages/Signup"));
const DashboardLayout = lazyRetry(() => import("../dashboard/layouts/DashboardLayout"));
const AdminOverview = lazyRetry(() => import("../dashboard/pages/AdminOverview"));
const UserOverview = lazyRetry(() => import("../dashboard/pages/UserOverview"));
const ResellerOverview = lazyRetry(() => import("../dashboard/pages/ResellerOverview"));
const AdminApis = lazyRetry(() => import("../pages/admin/AdminApis"));
const AdminUsers = lazyRetry(() => import("../pages/admin/AdminUsers"));
const AdminTransactions = lazyRetry(() => import("../pages/admin/AdminTransactions"));
const AdminSecurity = lazyRetry(() => import("../pages/admin/AdminSecurity"));
const AdminActivity = lazyRetry(() => import("../pages/admin/AdminActivity"));
const AdminSearchHistory = lazyRetry(() => import("../pages/admin/AdminSearchHistory"));

const IntelligenceCnic = lazyRetry(() => import("../pages/user/IntelligenceCnic"));
const IntelligenceMobile = lazyRetry(() => import("../pages/user/IntelligenceMobile"));
const VehiclePage = lazyRetry(() => import("../pages/user/VehiclePage"));
const FamilyTree = lazyRetry(() => import("../pages/user/FamilyTree"));
const SearchPage = lazyRetry(() => import("../pages/user/SearchPage"));
const UserProfile = lazyRetry(() => import("../pages/user/UserProfile"));
const UserSearches = lazyRetry(() => import("../pages/user/UserSearches"));
const UserTransactions = lazyRetry(() => import("../pages/user/UserTransactions"));
const ResellerUsers = lazyRetry(() => import("../pages/reseller/ResellerUsers"));
const EmailsInbox = lazyRetry(() => import("../pages/shared/EmailsInbox"));

export default function App() {
  const { user } = useAuth();
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={!user ? <Login /> : <Navigate to={user.role === "ADMIN" ? "/admin/dashboard" : user.role === "RESELLER" ? "/reseller/dashboard" : "/user/dashboard"} replace />} />
          <Route path="/signup" element={!user ? <Signup /> : <Navigate to={user.role === "ADMIN" ? "/admin/dashboard" : user.role === "RESELLER" ? "/reseller/dashboard" : "/user/dashboard"} replace />} />

          <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
            <Route path="/admin" element={<DashboardLayout />}>
              <Route path="dashboard" element={<AdminOverview />} />
              <Route path="stats" element={<AdminOverview />} />
              <Route path="overview" element={<AdminOverview />} />
              <Route path="api-management" element={<AdminApis />} />
              <Route path="user-management" element={<AdminUsers />} />
              <Route path="transactions" element={<AdminTransactions />} />
              <Route path="search-history" element={<AdminSearchHistory />} />
              <Route path="security" element={<AdminSecurity />} />
              <Route path="profile" element={<UserProfile />} />
              <Route path="emails" element={<EmailsInbox />} />
              <Route path="activity" element={<AdminActivity />} />
              <Route path="activity-logs" element={<AdminActivity />} />
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute roles={["USER"]} />}>
            <Route path="/user" element={<DashboardLayout />}>
              <Route path="dashboard" element={<UserOverview />} />
              <Route path="home" element={<UserOverview />} />
              <Route path="cnic-intelligence" element={<IntelligenceCnic />} />
              <Route path="mobile-intelligence" element={<IntelligenceMobile />} />
              <Route path="vehicle/:region" element={<VehiclePage />} />
              <Route path="family-tree" element={<FamilyTree />} />
              <Route path="service/:slug" element={<SearchPage />} />
              <Route path="profile" element={<UserProfile />} />
              <Route path="emails" element={<EmailsInbox />} />
              <Route path="settings/searches" element={<UserSearches />} />
              <Route path="settings/transactions" element={<UserTransactions />} />
              <Route index element={<Navigate to="/user/dashboard" replace />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute roles={["RESELLER"]} />}>
            <Route path="/reseller" element={<DashboardLayout />}>
              <Route path="dashboard" element={<ResellerOverview />} />
              <Route path="home" element={<ResellerOverview />} />
              <Route path="cnic-intelligence" element={<IntelligenceCnic />} />
              <Route path="mobile-intelligence" element={<IntelligenceMobile />} />
              <Route path="vehicle/:region" element={<VehiclePage />} />
              <Route path="family-tree" element={<FamilyTree />} />
              <Route path="service/:slug" element={<SearchPage />} />
              <Route path="profile" element={<UserProfile />} />
              <Route path="emails" element={<EmailsInbox />} />
              <Route path="users" element={<ResellerUsers />} />
              <Route path="settings/searches" element={<UserSearches />} />
              <Route path="settings/transactions" element={<UserTransactions />} />
              <Route index element={<Navigate to="/reseller/dashboard" replace />} />
            </Route>
          </Route>

          <Route path="/" element={<RoleRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

function RouteFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #071120 0%, #0f172a 46%, #134e4a 100%)",
        color: "#e2e8f0",
        fontWeight: 700,
        letterSpacing: "0.03em",
      }}
    >
      Loading workspace...
    </div>
  );
}
