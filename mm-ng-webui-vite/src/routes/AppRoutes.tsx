import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from '../layouts/AppShell';
import { RequireAuth } from './RequireAuth';
import { AboutPage } from '../pages/AboutPage';
import { AdminAuthenticationPage, AdminFeedsPage, AdminLayout, AdminUsersPage } from '../pages/AdminPages';
import { ConfigAddPage, ConfigEditPage, ConfigPage } from '../pages/ConfigPages';
import { IndicatorAddPage } from '../pages/IndicatorAddPage';
import { LoginPage } from '../pages/LoginPage';
import { LogsPage } from '../pages/LogsPage';
import { NodeDetailPage } from '../pages/NodeDetailPage';
import { NodesPage } from '../pages/NodesPage';
import { PrototypeAddPage, PrototypeDetailPage, PrototypeEditPage, PrototypesPage } from '../pages/PrototypePages';
import { StatusPage } from '../pages/StatusPage';
import { SystemDashboardPage, SystemExtensionsPage, SystemLayout } from '../pages/SystemPages';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/status" replace />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/overview" element={<Navigate to="/status" replace />} />
          <Route path="/dashboard" element={<Navigate to="/status" replace />} />
          <Route path="/nodes" element={<NodesPage />} />
          <Route path="/nodes/:nodename" element={<NodeDetailPage />} />
          <Route path="/prototypes" element={<PrototypesPage />} />
          <Route path="/prototypes/:libraryName/:prototypeName/edit" element={<PrototypeEditPage />} />
          <Route path="/prototypes/:libraryName/:prototypeName" element={<PrototypeDetailPage />} />
          <Route path="/prototypeadd" element={<PrototypeAddPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/config/add" element={<ConfigAddPage />} />
          <Route path="/config/:nodenum/edit" element={<ConfigEditPage />} />
          <Route path="/indicator/add" element={<IndicatorAddPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/system" element={<SystemLayout />}>
            <Route index element={<Navigate to="/system/dashboard" replace />} />
            <Route path="dashboard" element={<SystemDashboardPage />} />
            <Route path="extensions" element={<SystemExtensionsPage />} />
          </Route>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/users" replace />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="fusers" element={<AdminFeedsPage />} />
            <Route path="authentication" element={<AdminAuthenticationPage />} />
          </Route>
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<Navigate to="/status" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
