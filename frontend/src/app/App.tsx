import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/useAuth";
import Login from "../pages/Login";
import Signup from "../pages/Signup";
import AdminLayout from "../components/layouts/AdminLayout";
import UserLayout from "../components/layouts/UserLayout";
import ResellerLayout from "../components/layouts/ResellerLayout";

import AdminDashboard from "../pages/admin/AdminStats";
import AdminApis from "../pages/admin/AdminApis";
import AdminUsers from "../pages/admin/AdminUsers";
import AdminTransactions from "../pages/admin/AdminTransactions";
import AdminSecurity from "../pages/admin/AdminSecurity";
import AdminActivity from "../pages/admin/AdminActivity";

import UserDashboard from "../pages/user/UserHome";
import IntelligenceCnic from "../pages/user/IntelligenceCnic";
import IntelligenceMobile from "../pages/user/IntelligenceMobile";
import VehiclePage from "../pages/user/VehiclePage";
import FamilyTree from "../pages/user/FamilyTree";
import UserProfile from "../pages/user/UserProfile";
import UserSearches from "../pages/user/UserSearches";
import UserTransactions from "../pages/user/UserTransactions";
import ChangePassword from "../pages/user/ChangePassword";
import ResellerUsers from "../pages/reseller/ResellerUsers";

function RoleGate({ roles, children }: { roles: Array<"ADMIN" | "USER" | "RESELLER">; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    return <Navigate to={user.role === "ADMIN" ? "/admin/dashboard" : user.role === "RESELLER" ? "/reseller/dashboard" : "/user/dashboard"} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { user } = useAuth();
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to={user.role === "ADMIN" ? "/admin/dashboard" : user.role === "RESELLER" ? "/reseller/dashboard" : "/user/dashboard"} replace />} />
        <Route path="/signup" element={!user ? <Signup /> : <Navigate to={user.role === "ADMIN" ? "/admin/dashboard" : user.role === "RESELLER" ? "/reseller/dashboard" : "/user/dashboard"} replace />} />

        <Route
          path="/admin"
          element={
            <RoleGate roles={["ADMIN"]}>
              <AdminLayout />
            </RoleGate>
          }
        >
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="api-management" element={<AdminApis />} />
          <Route path="user-management" element={<AdminUsers />} />
          <Route path="transactions" element={<AdminTransactions />} />
          <Route path="security" element={<AdminSecurity />} />
          <Route path="activity-logs" element={<AdminActivity />} />
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
        </Route>

        <Route
          path="/user"
          element={
            <RoleGate roles={["USER"]}>
              <UserLayout />
            </RoleGate>
          }
        >
          <Route path="dashboard" element={<UserDashboard />} />
          <Route path="cnic-intelligence" element={<IntelligenceCnic />} />
          <Route path="mobile-intelligence" element={<IntelligenceMobile />} />
          <Route path="vehicle/:region" element={<VehiclePage />} />
          <Route path="family-tree" element={<FamilyTree />} />
          <Route path="profile" element={<UserProfile />} />
          <Route path="settings/searches" element={<UserSearches />} />
          <Route path="settings/transactions" element={<UserTransactions />} />
          <Route path="settings/change-password" element={<ChangePassword />} />
          <Route index element={<Navigate to="/user/dashboard" replace />} />
        </Route>

        <Route
          path="/reseller"
          element={
            <RoleGate roles={["RESELLER"]}>
              <ResellerLayout />
            </RoleGate>
          }
        >
          <Route path="dashboard" element={<UserDashboard />} />
          <Route path="cnic-intelligence" element={<IntelligenceCnic />} />
          <Route path="mobile-intelligence" element={<IntelligenceMobile />} />
          <Route path="vehicle/:region" element={<VehiclePage />} />
          <Route path="family-tree" element={<FamilyTree />} />
          <Route path="profile" element={<UserProfile />} />
          <Route path="users" element={<ResellerUsers />} />
          <Route path="settings/searches" element={<UserSearches />} />
          <Route path="settings/transactions" element={<UserTransactions />} />
          <Route path="settings/change-password" element={<ChangePassword />} />
          <Route index element={<Navigate to="/reseller/dashboard" replace />} />
        </Route>

        <Route path="/" element={<Navigate to={user ? (user.role === "ADMIN" ? "/admin/dashboard" : user.role === "RESELLER" ? "/reseller/dashboard" : "/user/dashboard") : "/login"} replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
