import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import ScienceRoundedIcon from "@mui/icons-material/ScienceRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import * as yup from "yup";
import { api } from "../../app/api";
import { getDashboardUi } from "../../dashboard/uiTokens";
import { getRoleLabel } from "../../utils/roleLabels";

type ApiAuthType = "NONE" | "API_KEY_HEADER" | "BEARER_TOKEN" | "BASIC_AUTH" | "SESSION_LOGIN" | "OAUTH2";
type ApiAuthConfig = { key?: string; value?: string; token?: string; username?: string; password?: string };
type ApiMethodConfig = { queryParam: string };
type ApiSessionConfig = {
  loginUrl?: string;
  usernameField?: string;
  passwordField?: string;
  captchaEnabled?: boolean;
  sessionPolicy?: string;
};
type ApiRateLimitConfig = {
  maxPerMinute?: number | null;
  maxPerDay?: number | null;
  cooldownSeconds?: number | null;
};
type ApiServiceLink = {
  serviceId: string;
  enabled: boolean;
  priority: number;
  service?: {
    id: string;
    name: string;
    status: boolean;
    type?: string;
  };
};
type ApiItem = {
  id: string;
  name: string;
  baseUrl: string;
  endpoint: string;
  method: "GET" | "POST" | string;
  authType: string;
  status: boolean;
  creditsPerSearch: number;
  queryParam?: string;
  sampleQuery?: string | null;
  auth_config?: ApiAuthConfig;
  method_config?: ApiMethodConfig;
  apiKeyHeader?: string | null;
  apiKeyValue?: string | null;
  bearerToken?: string | null;
  basicUser?: string | null;
  basicPass?: string | null;
  supportsCnic?: boolean;
  supportsPhone?: boolean;
  supportsEngine?: boolean;
  supportsChassis?: boolean;
  supportsReg?: boolean;
  supportsLicense?: boolean;
  customRegex?: string | null;
  allowUser?: boolean;
  allowReseller?: boolean;
  allowAdmin?: boolean;
  description?: string | null;
  loginUrl?: string | null;
  usernameField?: string | null;
  passwordField?: string | null;
  captchaEnabled?: boolean | null;
  sessionPolicy?: string | null;
  maxPerMinute?: number | null;
  maxPerDay?: number | null;
  cooldownSeconds?: number | null;
  session_config?: ApiSessionConfig;
  rate_limit_config?: ApiRateLimitConfig;
  serviceApis?: ApiServiceLink[];
};
type ServiceApiLink = {
  apiId: string;
  enabled: boolean;
  priority: number;
  api?: {
    id: string;
    name: string;
    status: boolean;
    creditsPerSearch: number;
  };
};
type ServiceItem = {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  type?: string;
  status: boolean;
  defaultCost: number;
  serviceApis: ServiceApiLink[];
  metrics?: {
    totalSearches: number;
    successSearches: number;
    errorSearches: number;
    blockedSearches: number;
    totalRevenueCredits: number;
    lastSearchAt?: string | null;
    successRate: number;
    mappedApis: number;
    activeMappedApis: number;
    runtimeCost: number;
  };
};
type ApiHealthItem = {
  id: string;
  name: string;
  status: string;
  apiEnabled: boolean;
  endpoint: string;
  method: string;
  sampleQuery?: string | null;
  rollingLatencyMs?: number | null;
  timeoutCount?: number;
  serviceMappings: Array<{
    serviceId: string;
    serviceName: string;
    mappingEnabled: boolean;
    priority: number;
  }>;
};
type ApiFormState = {
  name: string;
  method: "GET" | "POST";
  baseUrl: string;
  endpoint: string;
  description: string;
  authType: ApiAuthType;
  auth_config: ApiAuthConfig;
  session_config: ApiSessionConfig;
  method_config: ApiMethodConfig;
  rate_limit_config: ApiRateLimitConfig;
  creditsPerSearch: number;
  status: boolean;
  sampleQuery: string;
  supportsCnic: boolean;
  supportsPhone: boolean;
  supportsEngine: boolean;
  supportsChassis: boolean;
  supportsReg: boolean;
  supportsLicense: boolean;
  customRegex: string;
  allowUser: boolean;
  allowReseller: boolean;
  allowAdmin: boolean;
  serviceLinks: Array<{
    serviceId: string;
    enabled: boolean;
    priority: number;
  }>;
};

type RowActionTarget =
  | { kind: "api"; item: ApiItem }
  | { kind: "service"; item: ServiceItem }
  | { kind: "health"; item: ApiHealthItem };

type ServiceLinkFormItem = {
  apiId: string;
  enabled: boolean;
  priority: number;
};

function boolChip(value: boolean) {
  return <Chip size="small" label={value ? "Active" : "Inactive"} color={value ? "success" : "default"} variant="outlined" />;
}

function boolChipLabel(value: boolean, onLabel: string, offLabel: string) {
  return <Chip size="small" label={value ? onLabel : offLabel} color={value ? "success" : "default"} variant="outlined" />;
}

function formatWholeNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "0";
  return Math.round(parsed).toLocaleString("en-US");
}

function getHealthStatusLabel(item: ApiHealthItem) {
  const status = String(item.status ?? "").toUpperCase();
  const on = status === "HEALTHY";
  const labelBase = on ? "On" : "Off";
  const isPost = String(item.method ?? "").toUpperCase() === "POST";
  return {
    label: isPost ? `${labelBase} POST` : labelBase,
    color: on ? ("success" as const) : ("warning" as const),
  };
}

function getDefaultAuthConfig(authType: ApiAuthType): ApiAuthConfig {
  if (authType === "API_KEY_HEADER") return { key: "", value: "" };
  if (authType === "BEARER_TOKEN") return { token: "" };
  if (authType === "BASIC_AUTH") return { username: "", password: "" };
  return {};
}

function createEmptyApiForm(): ApiFormState {
  return {
    name: "",
    method: "GET",
    baseUrl: "",
    endpoint: "",
    description: "",
    authType: "NONE",
    auth_config: {},
    session_config: { loginUrl: "", usernameField: "", passwordField: "", captchaEnabled: false, sessionPolicy: "AUTO_REFRESH" },
    method_config: { queryParam: "query" },
    rate_limit_config: { maxPerMinute: null, maxPerDay: null, cooldownSeconds: null },
    creditsPerSearch: 1,
    status: true,
    sampleQuery: "",
    supportsCnic: false,
    supportsPhone: false,
    supportsEngine: false,
    supportsChassis: false,
    supportsReg: false,
    supportsLicense: false,
    customRegex: "",
    allowUser: true,
    allowReseller: true,
    allowAdmin: true,
    serviceLinks: [],
  };
}

function getApiFormFromItem(item: ApiItem, services: ServiceItem[]): ApiFormState {
  const authType = (item.authType || "NONE") as ApiAuthType;
  const byServiceId = new Map((item.serviceApis ?? []).map((link) => [link.serviceId, link]));
  return {
    name: item.name ?? "",
    method: (item.method || "GET") as "GET" | "POST",
    baseUrl: item.baseUrl ?? "",
    endpoint: item.endpoint ?? "",
    description: item.description ?? "",
    authType,
    auth_config:
      item.auth_config ??
      (authType === "API_KEY_HEADER"
        ? { key: item.apiKeyHeader ?? "", value: item.apiKeyValue ?? "" }
        : authType === "BEARER_TOKEN"
          ? { token: item.bearerToken ?? "" }
          : authType === "BASIC_AUTH"
            ? { username: item.basicUser ?? "", password: item.basicPass ?? "" }
          : {}),
    session_config:
      item.session_config ?? {
        loginUrl: item.loginUrl ?? "",
        usernameField: item.usernameField ?? "",
        passwordField: item.passwordField ?? "",
        captchaEnabled: item.captchaEnabled ?? false,
        sessionPolicy: item.sessionPolicy ?? "AUTO_REFRESH",
      },
    method_config: item.method_config ?? { queryParam: item.queryParam ?? "query" },
    rate_limit_config:
      item.rate_limit_config ?? {
        maxPerMinute: item.maxPerMinute ?? null,
        maxPerDay: item.maxPerDay ?? null,
        cooldownSeconds: item.cooldownSeconds ?? null,
      },
    creditsPerSearch: item.creditsPerSearch ?? 1,
    status: item.status ?? true,
    sampleQuery: item.sampleQuery ?? "",
    supportsCnic: item.supportsCnic ?? false,
    supportsPhone: item.supportsPhone ?? false,
    supportsEngine: item.supportsEngine ?? false,
    supportsChassis: item.supportsChassis ?? false,
    supportsReg: item.supportsReg ?? false,
    supportsLicense: item.supportsLicense ?? false,
    customRegex: item.customRegex ?? "",
    allowUser: item.allowUser ?? true,
    allowReseller: item.allowReseller ?? true,
    allowAdmin: item.allowAdmin ?? true,
    serviceLinks: services.map((service, index) => {
      const existing = byServiceId.get(service.id);
      return {
        serviceId: service.id,
        enabled: existing?.enabled ?? false,
        priority: existing?.priority ?? index + 1,
      };
    }),
  };
}

function toApiPayload(form: ApiFormState) {
  const queryParam = form.method_config.queryParam.trim();
  const authConfig = form.auth_config ?? {};
  return {
    name: form.name.trim(),
    method: form.method,
    baseUrl: form.baseUrl.trim(),
    endpoint: form.endpoint.trim(),
    description: form.description.trim() || undefined,
    authType: form.authType,
    auth_config: authConfig,
    session_config: {
      loginUrl: form.session_config.loginUrl?.trim() || undefined,
      usernameField: form.session_config.usernameField?.trim() || undefined,
      passwordField: form.session_config.passwordField?.trim() || undefined,
      captchaEnabled: Boolean(form.session_config.captchaEnabled),
      sessionPolicy: form.session_config.sessionPolicy?.trim() || undefined,
    },
    method_config: { queryParam },
    queryParam,
    apiKeyHeader: form.authType === "API_KEY_HEADER" ? authConfig.key?.trim() || undefined : undefined,
    apiKeyValue: form.authType === "API_KEY_HEADER" ? authConfig.value?.trim() || undefined : undefined,
    bearerToken: form.authType === "BEARER_TOKEN" ? authConfig.token?.trim() || undefined : undefined,
    basicUser: form.authType === "BASIC_AUTH" ? authConfig.username?.trim() || undefined : undefined,
    basicPass: form.authType === "BASIC_AUTH" ? authConfig.password?.trim() || undefined : undefined,
    loginUrl: form.authType === "SESSION_LOGIN" ? form.session_config.loginUrl?.trim() || undefined : undefined,
    usernameField: form.authType === "SESSION_LOGIN" ? form.session_config.usernameField?.trim() || undefined : undefined,
    passwordField: form.authType === "SESSION_LOGIN" ? form.session_config.passwordField?.trim() || undefined : undefined,
    captchaEnabled: form.authType === "SESSION_LOGIN" ? Boolean(form.session_config.captchaEnabled) : undefined,
    sessionPolicy: form.authType === "SESSION_LOGIN" ? form.session_config.sessionPolicy?.trim() || undefined : undefined,
    rate_limit_config: {
      maxPerMinute: form.rate_limit_config.maxPerMinute ?? null,
      maxPerDay: form.rate_limit_config.maxPerDay ?? null,
      cooldownSeconds: form.rate_limit_config.cooldownSeconds ?? null,
    },
    maxPerMinute: form.rate_limit_config.maxPerMinute ?? null,
    maxPerDay: form.rate_limit_config.maxPerDay ?? null,
    cooldownSeconds: form.rate_limit_config.cooldownSeconds ?? null,
    creditsPerSearch: Number(form.creditsPerSearch),
    status: form.status,
    sampleQuery: form.sampleQuery.trim() || undefined,
    supportsCnic: form.supportsCnic,
    supportsPhone: form.supportsPhone,
    supportsEngine: form.supportsEngine,
    supportsChassis: form.supportsChassis,
    supportsReg: form.supportsReg,
    supportsLicense: form.supportsLicense,
    customRegex: form.customRegex.trim() || undefined,
    allowUser: form.allowUser,
    allowReseller: form.allowReseller,
    allowAdmin: form.allowAdmin,
    serviceLinks: form.serviceLinks
      .filter((item) => item.enabled)
      .sort((a, b) => a.priority - b.priority)
      .map((item, index) => ({
        serviceId: item.serviceId,
        enabled: true,
        priority: index + 1,
      })),
  };
}

function normalizeServiceLinks(service: ServiceItem | null, apis: ApiItem[]): ServiceLinkFormItem[] {
  if (!service) return apis.map((item, index) => ({ apiId: item.id, enabled: false, priority: index + 1 }));
  const byApiId = new Map(service.serviceApis.map((item) => [item.apiId, item]));
  return apis.map((item, index) => {
    const existing = byApiId.get(item.id);
    return {
      apiId: item.id,
      enabled: existing?.enabled ?? false,
      priority: existing?.priority ?? index + 1,
    };
  });
}

function blurActiveElement() {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement) activeElement.blur();
}

export default function AdminApis() {
  const [searchParams] = useSearchParams();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const ui = getDashboardUi(theme.palette.mode);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [apis, setApis] = useState<ApiItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [healthItems, setHealthItems] = useState<ApiHealthItem[]>([]);
  const [query, setQuery] = useState("");
  const [editingApi, setEditingApi] = useState<ApiItem | null>(null);
  const [editingSvc, setEditingSvc] = useState<ServiceItem | null>(null);
  const [apiOpen, setApiOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [testQuery, setTestQuery] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [testingApi, setTestingApi] = useState(false);
  const [apiErrors, setApiErrors] = useState<Record<string, string>>({});
  const [actionsAnchorEl, setActionsAnchorEl] = useState<HTMLElement | null>(null);
  const [actionsTarget, setActionsTarget] = useState<RowActionTarget | null>(null);
  const [apiForm, setApiForm] = useState<ApiFormState>(createEmptyApiForm);
  const [svcForm, setSvcForm] = useState({
    name: "",
    description: "",
    icon: "",
    type: "Search",
    defaultCost: 1,
    status: true,
    links: [] as ServiceLinkFormItem[],
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [apisRes, servicesRes, healthRes] = await Promise.all([api.get("/admin/apis"), api.get("/admin/services"), api.get("/admin/api-health")]);
      const apiItems = apisRes.data?.items ?? apisRes.data?.apis ?? apisRes.data ?? [];
      const serviceItems = servicesRes.data?.items ?? servicesRes.data?.services ?? servicesRes.data ?? [];
      const apiHealthItems = healthRes.data?.items ?? [];
      setApis(Array.isArray(apiItems) ? apiItems : []);
      setServices(Array.isArray(serviceItems) ? serviceItems : []);
      setHealthItems(Array.isArray(apiHealthItems) ? apiHealthItems : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load APIs and services.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredApis = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return apis;
    return apis.filter((item) =>
      [item.name, item.baseUrl, item.endpoint, item.method, item.authType].filter(Boolean).join(" ").toLowerCase().includes(needle)
    );
  }, [apis, query]);

  const filteredServices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return services;
    return services.filter((item) =>
      [item.name, item.type, item.icon, item.description].filter(Boolean).join(" ").toLowerCase().includes(needle)
    );
  }, [services, query]);

  const healthFilter = searchParams.get("health");
  const filteredHealthItems = useMemo(() => {
    const value = (healthFilter ?? "").toUpperCase();
    if (!value) return healthItems;
    if (value === "HEALTHY") return healthItems.filter((item) => String(item.status || "").toUpperCase() === "HEALTHY");
    if (value === "UNHEALTHY") return healthItems.filter((item) => String(item.status || "").toUpperCase() === "UNHEALTHY");
    if (value === "DISABLED") return healthItems.filter((item) => !item.apiEnabled);
    return healthItems;
  }, [healthFilter, healthItems]);

  function openCreateApi() {
    blurActiveElement();
    setEditingApi(null);
    setApiForm({
      ...createEmptyApiForm(),
      serviceLinks: services.map((service, index) => ({
        serviceId: service.id,
        enabled: false,
        priority: index + 1,
      })),
    });
    setApiErrors({});
    setTestQuery("");
    setTestResponse("");
    setApiOpen(true);
  }

  function openEditApi(item: ApiItem) {
    blurActiveElement();
    const nextForm = getApiFormFromItem(item, services);
    setEditingApi(item);
    setApiForm(nextForm);
    setApiErrors({});
    setTestQuery(nextForm.sampleQuery || "");
    setTestResponse("");
    setApiOpen(true);
  }

  function setApiServiceLinkEnabled(serviceId: string, enabled: boolean) {
    setApiForm((prev) => ({
      ...prev,
      serviceLinks: prev.serviceLinks.map((item) => (item.serviceId === serviceId ? { ...item, enabled } : item)),
    }));
  }

  function setApiServiceLinkPriority(serviceId: string, priority: number) {
    setApiForm((prev) => ({
      ...prev,
      serviceLinks: prev.serviceLinks.map((item) =>
        item.serviceId === serviceId ? { ...item, priority: Number.isFinite(priority) && priority > 0 ? priority : 1 } : item
      ),
    }));
  }

  function openCreateService() {
    blurActiveElement();
    setEditingSvc(null);
    setSvcForm({
      name: "",
      description: "",
      icon: "",
      type: "Search",
      defaultCost: 1,
      status: true,
      links: normalizeServiceLinks(null, apis),
    });
    setServiceOpen(true);
  }

  function openEditService(item: ServiceItem) {
    blurActiveElement();
    setEditingSvc(item);
    setSvcForm({
      name: item.name,
      description: item.description ?? "",
      icon: item.icon ?? "",
      type: item.type ?? "Search",
      defaultCost: item.defaultCost ?? 1,
      status: item.status ?? true,
      links: normalizeServiceLinks(item, apis),
    });
    setServiceOpen(true);
  }

  function setAuthType(nextType: ApiAuthType) {
    setApiForm((prev) => ({ ...prev, authType: nextType, auth_config: getDefaultAuthConfig(nextType) }));
    setApiErrors({});
  }

  function setServiceLinkEnabled(apiId: string, enabled: boolean) {
    setSvcForm((prev) => ({
      ...prev,
      links: prev.links.map((item) => (item.apiId === apiId ? { ...item, enabled } : item)),
    }));
  }

  function setServiceLinkPriority(apiId: string, priority: number) {
    setSvcForm((prev) => ({
      ...prev,
      links: prev.links.map((item) =>
        item.apiId === apiId ? { ...item, priority: Number.isFinite(priority) && priority > 0 ? priority : 1 } : item
      ),
    }));
  }

  async function validateApiForm() {
    const schema = yup.object({
      name: yup.string().trim().min(2, "Name must be at least 2 characters").required("Name is required"),
      method: yup.string().oneOf(["GET", "POST"]).required("Method is required"),
      baseUrl: yup.string().trim().url("Base URL must be valid").required("Base URL is required"),
      endpoint: yup.string().default(""),
      description: yup.string().default(""),
      authType: yup.string().oneOf(["NONE", "API_KEY_HEADER", "BEARER_TOKEN", "BASIC_AUTH", "SESSION_LOGIN", "OAUTH2"]).required(),
      method_config: yup.object({
        queryParam: yup.string().trim().required("Query param is required"),
      }),
      auth_config: yup
        .object()
        .when("authType", {
          is: "API_KEY_HEADER",
          then: () => yup.object({ key: yup.string().trim().required("Header key is required"), value: yup.string().trim().required("Header value is required") }),
        })
        .when("authType", {
          is: "BEARER_TOKEN",
          then: () => yup.object({ token: yup.string().trim().required("Token is required") }),
        })
        .when("authType", {
          is: "BASIC_AUTH",
          then: () =>
            yup.object({
              username: yup.string().trim().required("Username is required"),
              password: yup.string().trim().required("Password is required"),
            }),
        }),
      session_config: yup.object().when("authType", {
        is: "SESSION_LOGIN",
        then: () =>
          yup.object({
            loginUrl: yup.string().trim().url("Login URL must be valid").required("Login URL is required"),
            usernameField: yup.string().trim().required("Username field is required"),
            passwordField: yup.string().trim().required("Password field is required"),
            captchaEnabled: yup.boolean().default(false),
            sessionPolicy: yup.string().trim().required("Session policy is required"),
          }),
      }),
      rate_limit_config: yup.object({
        maxPerMinute: yup.number().nullable().transform((value, originalValue) => (originalValue === "" || originalValue == null ? null : value)).integer().min(1).nullable(),
        maxPerDay: yup.number().nullable().transform((value, originalValue) => (originalValue === "" || originalValue == null ? null : value)).integer().min(1).nullable(),
        cooldownSeconds: yup.number().nullable().transform((value, originalValue) => (originalValue === "" || originalValue == null ? null : value)).integer().min(0).nullable(),
      }),
      creditsPerSearch: yup.number().typeError("Credits must be a number").integer().min(0).required(),
      status: yup.boolean().required(),
    });

    try {
      await schema.validate(apiForm, { abortEarly: false });
      setApiErrors({});
      return true;
    } catch (validationError) {
      if (validationError instanceof yup.ValidationError) {
        const nextErrors: Record<string, string> = {};
        for (const item of validationError.inner) {
          if (item.path && !nextErrors[item.path]) nextErrors[item.path] = item.message;
        }
        setApiErrors(nextErrors);
      }
      return false;
    }
  }

  async function saveApi() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const valid = await validateApiForm();
      if (!valid) return;
      const payload = toApiPayload(apiForm);
      if (editingApi) await api.put(`/admin/apis/${editingApi.id}`, payload);
      else await api.post("/admin/apis", payload);
      setApiOpen(false);
      setSuccess("API saved.");
      await load();
    } catch (e: any) {
      const issues = Array.isArray(e?.response?.data?.issues) ? e.response.data.issues : [];
      if (issues.length) {
        const nextErrors: Record<string, string> = {};
        for (const issue of issues) {
          const path = Array.isArray(issue?.path) ? issue.path.join(".") : "";
          if (path && !nextErrors[path]) nextErrors[path] = issue?.message || "Invalid value";
        }
        if (Object.keys(nextErrors).length) setApiErrors(nextErrors);
      }
      setError(
        issues[0]?.message ||
          e?.response?.data?.message ||
          e?.message ||
          "Failed to save API."
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveService() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        ...svcForm,
        links: svcForm.links
          .filter((item) => item.enabled)
          .sort((a, b) => a.priority - b.priority)
          .map((item, index) => ({
            apiId: item.apiId,
            enabled: true,
            priority: index + 1,
          })),
      };
      if (editingSvc) await api.put(`/admin/services/${editingSvc.id}`, payload);
      else await api.post("/admin/services", payload);
      setServiceOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to save service.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleApi(id: string) {
    setSaving(true);
    setSuccess("");
    try {
      await api.post(`/admin/apis/${id}/toggle`, {});
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to toggle API.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteApi(id: string) {
    if (!window.confirm("Delete this API?")) return;
    setSaving(true);
    setSuccess("");
    try {
      await api.delete(`/admin/apis/${id}`);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to delete API.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleService(id: string) {
    setSaving(true);
    setSuccess("");
    try {
      await api.post(`/admin/services/${id}/toggle`, {});
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to toggle service.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteService(id: string) {
    if (!window.confirm("Delete this service?")) return;
    setSaving(true);
    setSuccess("");
    try {
      await api.delete(`/admin/services/${id}`);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to delete service.");
    } finally {
      setSaving(false);
    }
  }

  async function runLiveTest() {
    if (!editingApi) {
      setError("Save API first to use live testing.");
      return;
    }
    setTestingApi(true);
    setError("");
    setSuccess("");
    try {
      const response = await api.post(`/admin/apis/${editingApi.id}/test`, {
        query: testQuery.trim() || apiForm.sampleQuery.trim(),
      });
      setTestResponse(JSON.stringify(response.data?.result ?? response.data, null, 2));
    } catch (e: any) {
      setTestResponse(
        JSON.stringify(
          {
            status: e?.response?.status,
            data: e?.response?.data ?? null,
            message: e?.message ?? "Live test failed",
          },
          null,
          2
        )
      );
    } finally {
      setTestingApi(false);
    }
  }

  async function probeApiHealthItem(item: ApiHealthItem) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.post(`/admin/api-health/${item.id}/probe`, { query: item.sampleQuery || undefined });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to probe API health.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleApiHealthItem(item: ApiHealthItem) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.post(`/admin/api-health/${item.id}/toggle`, {});
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to toggle API health.");
    } finally {
      setSaving(false);
    }
  }

  async function syncMappings() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await api.post("/admin/apis/sync-mappings", {});
      const summary = res.data?.summary;
      const totalApis = Number(summary?.totalApis ?? 0);
      const totalCreated = Number(summary?.totalCreatedLinks ?? 0);
      const totalUpdated = Number(summary?.totalUpdatedLinks ?? 0);
      const totalRemoved = Number(summary?.totalRemovedLinks ?? 0);
      setSuccess(`Mappings synced for ${totalApis} APIs. Created ${totalCreated}, updated ${totalUpdated}, removed ${totalRemoved}.`);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to sync API mappings.");
    } finally {
      setSaving(false);
    }
  }

  function openRowActions(event: MouseEvent<HTMLElement>, target: RowActionTarget) {
    setActionsAnchorEl(event.currentTarget);
    setActionsTarget(target);
  }

  function closeRowActions() {
    setActionsAnchorEl(null);
    setActionsTarget(null);
  }

  const rowActionButtonSx = {
    minWidth: { xs: 64, md: 72 },
    height: { xs: 26, md: 28 },
    borderRadius: 999,
    px: 1.1,
    fontWeight: 700,
    fontSize: { xs: "0.64rem", md: "0.72rem" },
    textTransform: "none",
    whiteSpace: "nowrap",
  };

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={2}>
        <Box>
          <Typography variant="h4" mb={0.5} sx={{ color: ui.text.primary }}>
            API Management
          </Typography>
          <Typography variant="body2" sx={{ color: ui.text.secondary }}>
            Configure APIs, service mapping, and live connectivity.
          </Typography>
        </Box>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
          <TextField
            size="small"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search APIs or services"
          />
          <Button startIcon={<RefreshRoundedIcon />} variant="outlined" onClick={load} disabled={loading}>
            Refresh
          </Button>
        </Stack>
      </Stack>

      {success ? <Alert severity="success" onClose={() => setSuccess("")}>{success}</Alert> : null}
      {error ? <Alert severity="warning" onClose={() => setError("")}>{error}</Alert> : null}

      <Grid container spacing={3} sx={{ width: "100%", m: 0 }}>
        <Grid item xs={12} xl={6}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} spacing={1.25} mb={2}>
                <Typography variant="h6">Configured APIs</Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button startIcon={<RefreshRoundedIcon />} variant="outlined" onClick={syncMappings} disabled={saving}>
                    Auto Sync Legacy
                  </Button>
                  <Button startIcon={<AddRoundedIcon />} variant="contained" onClick={openCreateApi}>
                    Add API
                  </Button>
                </Stack>
              </Stack>
              <Box sx={{ overflowX: "auto", overflowY: "auto", maxHeight: { xs: 360, md: 520 }, minHeight: { xs: 300, md: 520 }, pr: 1 }}>
                <Table size="small" sx={{ "& th, & td": { whiteSpace: "nowrap" } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>API Name</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredApis.map((item) => (
                      <TableRow key={item.id} hover>
                        <TableCell>
                          <Typography fontWeight={800} sx={{ whiteSpace: "nowrap", fontSize: "0.6rem" }}>
                            {item.name}
                          </Typography>
                        </TableCell>
                        <TableCell>{boolChip(Boolean(item.status))}</TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="outlined"
                            sx={rowActionButtonSx}
                            endIcon={<KeyboardArrowDownRoundedIcon fontSize="inherit" />}
                            onClick={(event) => openRowActions(event, { kind: "api", item })}
                          >
                            Actions
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} xl={6}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} spacing={1.25} mb={2}>
                <Typography variant="h6">Configured Services</Typography>
                <Button startIcon={<AddRoundedIcon />} variant="contained" onClick={openCreateService}>
                  Add Service
                </Button>
              </Stack>
              <Box sx={{ overflowX: "auto", overflowY: "auto", maxHeight: { xs: 360, md: 520 }, minHeight: { xs: 300, md: 520 }, pr: 1 }}>
                <Table size="small" sx={{ "& th, & td": { whiteSpace: "nowrap" } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell align="right">Total Earn</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredServices.map((item) => (
                      <TableRow key={item.id} hover>
                        <TableCell>
                          <Typography fontWeight={800} sx={{ whiteSpace: "nowrap", fontSize: "0.6rem" }}>
                            {item.name}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography fontWeight={700} sx={{ whiteSpace: "nowrap" }}>
                            {formatWholeNumber(item.metrics?.totalRevenueCredits ?? 0)}
                          </Typography>
                        </TableCell>
                        <TableCell>{boolChipLabel(Boolean(item.status), "On", "Off")}</TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="outlined"
                            sx={rowActionButtonSx}
                            endIcon={<KeyboardArrowDownRoundedIcon fontSize="inherit" />}
                            onClick={(event) => openRowActions(event, { kind: "service", item })}
                          >
                            Actions
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={0.5}>
                Unified Search Mapping
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Services are your products. APIs are the backend sources used by unified search. Edit each service to control which APIs are active and in what priority order.
              </Typography>
              <Stack spacing={1.25}>
                {services.map((service) => (
                  <Box
                    key={service.id}
                    sx={{
                      border: `1px solid ${ui.surface.border}`,
                      borderRadius: 2,
                      px: 2,
                      py: 1.5,
                    }}
                  >
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }}>
                      <Box>
                        <Typography fontWeight={800}>{service.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Active APIs: {service.metrics?.activeMappedApis ?? 0} / {service.metrics?.mappedApis ?? 0} | Revenue credits: {service.metrics?.totalRevenueCredits ?? 0}
                        </Typography>
                      </Box>
                      <Button size="small" startIcon={<EditRoundedIcon />} onClick={() => openEditService(service)}>
                        Edit Mapping
                      </Button>
                    </Stack>
                    <Stack direction="row" flexWrap="wrap" gap={1} mt={1.25}>
                      {service.serviceApis.length ? (
                        service.serviceApis.map((link) => (
                          <Chip
                            key={`${service.id}-${link.apiId}`}
                            size="small"
                            color={link.enabled ? "primary" : "default"}
                            variant={link.enabled ? "filled" : "outlined"}
                            label={`${link.priority}. ${link.api?.name ?? link.apiId}${link.enabled ? "" : " (off)"}`}
                          />
                        ))
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No APIs mapped yet.
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} spacing={1.25} mb={2}>
            <Box>
              <Typography variant="h6">API Health</Typography>
              <Typography variant="body2" color="text.secondary">Runtime health, probe latency, and service mappings.</Typography>
            </Box>
            <Button startIcon={<RefreshRoundedIcon />} variant="outlined" onClick={load} disabled={loading}>
              Refresh Health
            </Button>
          </Stack>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" sx={{ "& th, & td": { whiteSpace: "nowrap" } }}>
              <TableHead>
                <TableRow>
                  <TableCell>API Name</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Latency</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredHealthItems.map((item) => (
                  <TableRow key={item.id} hover>
                    <TableCell>
                      <Typography fontWeight={800} fontSize={{ xs: "0.6rem", md: "0.6rem" }} sx={{ whiteSpace: "nowrap" }}>
                        {item.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const mapped = getHealthStatusLabel(item);
                        return <Chip size="small" label={mapped.label} color={mapped.color} variant="outlined" />;
                      })()}
                    </TableCell>
                    <TableCell sx={{ fontSize: { xs: "0.72rem", md: "0.82rem" } }}>{item.rollingLatencyMs ? `${item.rollingLatencyMs} ms` : "-"}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="outlined"
                        sx={rowActionButtonSx}
                        endIcon={<KeyboardArrowDownRoundedIcon fontSize="inherit" />}
                        onClick={(event) => openRowActions(event, { kind: "health", item })}
                      >
                        Actions
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredHealthItems.length ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Typography color="text.secondary">No API health records available.</Typography>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>

      <Menu
        anchorEl={actionsAnchorEl}
        open={Boolean(actionsAnchorEl && actionsTarget)}
        onClose={closeRowActions}
        keepMounted
      >
        {actionsTarget?.kind === "api" ? (
          <>
            <MenuItem
              onClick={() => {
                const item = actionsTarget.item;
                closeRowActions();
                openEditApi(item);
              }}
            >
              Edit
            </MenuItem>
            <MenuItem
              onClick={() => {
                const item = actionsTarget.item;
                closeRowActions();
                void toggleApi(item.id);
              }}
            >
              {actionsTarget.item.status ? "Pause" : "Start"}
            </MenuItem>
            <MenuItem
              onClick={() => {
                const item = actionsTarget.item;
                closeRowActions();
                void deleteApi(item.id);
              }}
            >
              Delete
            </MenuItem>
          </>
        ) : null}

        {actionsTarget?.kind === "service" ? (
          <>
            <MenuItem
              onClick={() => {
                const item = actionsTarget.item;
                closeRowActions();
                openEditService(item);
              }}
            >
              Edit
            </MenuItem>
            <MenuItem
              onClick={() => {
                const item = actionsTarget.item;
                closeRowActions();
                void toggleService(item.id);
              }}
            >
              {actionsTarget.item.status ? "Pause" : "Start"}
            </MenuItem>
            <MenuItem
              onClick={() => {
                const item = actionsTarget.item;
                closeRowActions();
                void deleteService(item.id);
              }}
            >
              Delete
            </MenuItem>
          </>
        ) : null}

        {actionsTarget?.kind === "health" ? (
          <>
            <MenuItem
              onClick={() => {
                const item = actionsTarget.item;
                closeRowActions();
                void probeApiHealthItem(item);
              }}
            >
              Probe
            </MenuItem>
            <MenuItem
              onClick={() => {
                const item = actionsTarget.item;
                closeRowActions();
                void toggleApiHealthItem(item);
              }}
            >
              {actionsTarget.item.apiEnabled ? "Pause" : "Start"}
            </MenuItem>
          </>
        ) : null}
      </Menu>

      <Dialog open={apiOpen} onClose={() => { blurActiveElement(); setApiOpen(false); }} fullWidth fullScreen={isMobile} maxWidth="md">
        <DialogTitle>{editingApi ? "Edit API" : "Add API"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField
              label="Name"
              value={apiForm.name}
              onChange={(e) => setApiForm((prev) => ({ ...prev, name: e.target.value }))}
              error={Boolean(apiErrors.name)}
              helperText={apiErrors.name}
            />
            <TextField
              label="Description"
              value={apiForm.description}
              onChange={(e) => setApiForm((prev) => ({ ...prev, description: e.target.value }))}
              multiline
              minRows={2}
            />
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  select
                  fullWidth
                  label="Method"
                  value={apiForm.method}
                  onChange={(e) => setApiForm((prev) => ({ ...prev, method: e.target.value as "GET" | "POST" }))}
                  error={Boolean(apiErrors.method)}
                  helperText={apiErrors.method}
                >
                  <MenuItem value="GET">GET</MenuItem>
                  <MenuItem value="POST">POST</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  select
                  fullWidth
                  label="Auth Type"
                  value={apiForm.authType}
                  onChange={(e) => setAuthType(e.target.value as ApiAuthType)}
                  error={Boolean(apiErrors.authType)}
                  helperText={apiErrors.authType}
                >
                  <MenuItem value="NONE">NONE</MenuItem>
                  <MenuItem value="API_KEY_HEADER">API_KEY_HEADER</MenuItem>
                  <MenuItem value="BEARER_TOKEN">BEARER_TOKEN</MenuItem>
                  <MenuItem value="BASIC_AUTH">BASIC_AUTH</MenuItem>
                  <MenuItem value="SESSION_LOGIN">SESSION_LOGIN</MenuItem>
                  <MenuItem value="OAUTH2">OAUTH2</MenuItem>
                </TextField>
              </Grid>
            </Grid>
            <TextField
              label="Base URL"
              value={apiForm.baseUrl}
              onChange={(e) => setApiForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
              error={Boolean(apiErrors.baseUrl)}
              helperText={apiErrors.baseUrl}
            />
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Endpoint"
                  value={apiForm.endpoint}
                  onChange={(e) => setApiForm((prev) => ({ ...prev, endpoint: e.target.value }))}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Query Param"
                  value={apiForm.method_config.queryParam}
                  onChange={(e) =>
                    setApiForm((prev) => ({
                      ...prev,
                      method_config: { ...prev.method_config, queryParam: e.target.value },
                    }))
                  }
                  error={Boolean(apiErrors["method_config.queryParam"])}
                  helperText={apiErrors["method_config.queryParam"]}
                />
              </Grid>
            </Grid>

            {apiForm.authType !== "NONE" ? (
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={800} mb={2}>
                    Auth Config
                  </Typography>
                  <Grid container spacing={2}>
                    {apiForm.authType === "API_KEY_HEADER" ? (
                      <>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            label="Header Key"
                            value={apiForm.auth_config.key ?? ""}
                            onChange={(e) =>
                              setApiForm((prev) => ({ ...prev, auth_config: { ...prev.auth_config, key: e.target.value } }))
                            }
                            error={Boolean(apiErrors["auth_config.key"])}
                            helperText={apiErrors["auth_config.key"]}
                          />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            label="Header Value"
                            value={apiForm.auth_config.value ?? ""}
                            onChange={(e) =>
                              setApiForm((prev) => ({ ...prev, auth_config: { ...prev.auth_config, value: e.target.value } }))
                            }
                            error={Boolean(apiErrors["auth_config.value"])}
                            helperText={apiErrors["auth_config.value"]}
                          />
                        </Grid>
                      </>
                    ) : null}
                    {apiForm.authType === "BEARER_TOKEN" ? (
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          label="Bearer Token"
                          value={apiForm.auth_config.token ?? ""}
                          onChange={(e) =>
                            setApiForm((prev) => ({ ...prev, auth_config: { ...prev.auth_config, token: e.target.value } }))
                          }
                          error={Boolean(apiErrors["auth_config.token"])}
                          helperText={apiErrors["auth_config.token"]}
                        />
                      </Grid>
                    ) : null}
                    {apiForm.authType === "BASIC_AUTH" ? (
                      <>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            label="Username"
                            value={apiForm.auth_config.username ?? ""}
                            onChange={(e) =>
                              setApiForm((prev) => ({ ...prev, auth_config: { ...prev.auth_config, username: e.target.value } }))
                            }
                            error={Boolean(apiErrors["auth_config.username"])}
                            helperText={apiErrors["auth_config.username"]}
                          />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            type="password"
                            label="Password"
                            value={apiForm.auth_config.password ?? ""}
                            onChange={(e) =>
                              setApiForm((prev) => ({ ...prev, auth_config: { ...prev.auth_config, password: e.target.value } }))
                            }
                            error={Boolean(apiErrors["auth_config.password"])}
                            helperText={apiErrors["auth_config.password"]}
                          />
                        </Grid>
                      </>
                    ) : null}
                    {apiForm.authType === "SESSION_LOGIN" ? (
                      <>
                        <Grid item xs={12}>
                          <TextField
                            fullWidth
                            label="Login URL"
                            value={apiForm.session_config.loginUrl ?? ""}
                            onChange={(e) =>
                              setApiForm((prev) => ({ ...prev, session_config: { ...prev.session_config, loginUrl: e.target.value } }))
                            }
                            error={Boolean(apiErrors["session_config.loginUrl"])}
                            helperText={apiErrors["session_config.loginUrl"]}
                          />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            label="Username Field"
                            value={apiForm.session_config.usernameField ?? ""}
                            onChange={(e) =>
                              setApiForm((prev) => ({ ...prev, session_config: { ...prev.session_config, usernameField: e.target.value } }))
                            }
                            error={Boolean(apiErrors["session_config.usernameField"])}
                            helperText={apiErrors["session_config.usernameField"]}
                          />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            label="Password Field"
                            value={apiForm.session_config.passwordField ?? ""}
                            onChange={(e) =>
                              setApiForm((prev) => ({ ...prev, session_config: { ...prev.session_config, passwordField: e.target.value } }))
                            }
                            error={Boolean(apiErrors["session_config.passwordField"])}
                            helperText={apiErrors["session_config.passwordField"]}
                          />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField
                            select
                            fullWidth
                            label="Session Policy"
                            value={apiForm.session_config.sessionPolicy ?? "AUTO_REFRESH"}
                            onChange={(e) =>
                              setApiForm((prev) => ({ ...prev, session_config: { ...prev.session_config, sessionPolicy: e.target.value } }))
                            }
                            error={Boolean(apiErrors["session_config.sessionPolicy"])}
                            helperText={apiErrors["session_config.sessionPolicy"]}
                          >
                            <MenuItem value="AUTO_REFRESH">AUTO_REFRESH</MenuItem>
                            <MenuItem value="MANUAL">MANUAL</MenuItem>
                          </TextField>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={Boolean(apiForm.session_config.captchaEnabled)}
                                onChange={(e) =>
                                  setApiForm((prev) => ({
                                    ...prev,
                                    session_config: { ...prev.session_config, captchaEnabled: e.target.checked },
                                  }))
                                }
                              />
                            }
                            label="Captcha enabled"
                          />
                        </Grid>
                      </>
                    ) : null}
                  </Grid>
                </CardContent>
              </Card>
            ) : null}

            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Credits Per Search"
                  value={apiForm.creditsPerSearch}
                  onChange={(e) => setApiForm((prev) => ({ ...prev, creditsPerSearch: Number(e.target.value) }))}
                  error={Boolean(apiErrors.creditsPerSearch)}
                  helperText={apiErrors.creditsPerSearch}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Sample Query"
                  value={apiForm.sampleQuery}
                  onChange={(e) => setApiForm((prev) => ({ ...prev, sampleQuery: e.target.value }))}
                />
              </Grid>
            </Grid>
            <FormControlLabel
              control={<Checkbox checked={apiForm.status} onChange={(e) => setApiForm((prev) => ({ ...prev, status: e.target.checked }))} />}
              label="API enabled"
            />
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" fontWeight={800} mb={1.5}>
                  Rate Limits
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Max / Minute"
                      value={apiForm.rate_limit_config.maxPerMinute ?? ""}
                      onChange={(e) =>
                        setApiForm((prev) => ({
                          ...prev,
                          rate_limit_config: {
                            ...prev.rate_limit_config,
                            maxPerMinute: e.target.value === "" ? null : Number(e.target.value),
                          },
                        }))
                      }
                      error={Boolean(apiErrors["rate_limit_config.maxPerMinute"])}
                      helperText={apiErrors["rate_limit_config.maxPerMinute"] || "Optional"}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Max / Day"
                      value={apiForm.rate_limit_config.maxPerDay ?? ""}
                      onChange={(e) =>
                        setApiForm((prev) => ({
                          ...prev,
                          rate_limit_config: {
                            ...prev.rate_limit_config,
                            maxPerDay: e.target.value === "" ? null : Number(e.target.value),
                          },
                        }))
                      }
                      error={Boolean(apiErrors["rate_limit_config.maxPerDay"])}
                      helperText={apiErrors["rate_limit_config.maxPerDay"] || "Optional"}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Cooldown (sec)"
                      value={apiForm.rate_limit_config.cooldownSeconds ?? ""}
                      onChange={(e) =>
                        setApiForm((prev) => ({
                          ...prev,
                          rate_limit_config: {
                            ...prev.rate_limit_config,
                            cooldownSeconds: e.target.value === "" ? null : Number(e.target.value),
                          },
                        }))
                      }
                      error={Boolean(apiErrors["rate_limit_config.cooldownSeconds"])}
                      helperText={apiErrors["rate_limit_config.cooldownSeconds"] || "Optional"}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" fontWeight={800} mb={0.75}>
                  Service Selection
                </Typography>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Select exact service names for this API. These links are used directly, so no guessed mapping is needed.
                </Typography>
                <Stack spacing={1.25}>
                  {services.map((service) => {
                    const link = apiForm.serviceLinks.find((item) => item.serviceId === service.id) ?? {
                      serviceId: service.id,
                      enabled: false,
                      priority: 1,
                    };
                    return (
                      <Box
                        key={service.id}
                        sx={{
                          border: `1px solid ${ui.surface.border}`,
                          borderRadius: 2,
                          px: 1.5,
                          py: 1,
                        }}
                      >
                        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }}>
                          <Box sx={{ minWidth: 0 }}>
                            <FormControlLabel
                              control={<Checkbox checked={link.enabled} onChange={(e) => setApiServiceLinkEnabled(service.id, e.target.checked)} />}
                              label={service.name}
                            />
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", ml: 4 }}>
                              {service.type ?? "Search"} | {service.status ? "Active" : "Inactive"}
                            </Typography>
                          </Box>
                          <TextField
                            size="small"
                            type="number"
                            label="Priority"
                            value={link.priority}
                            disabled={!link.enabled}
                            onChange={(e) => setApiServiceLinkPriority(service.id, Number(e.target.value))}
                            sx={{ width: { xs: "100%", md: 110 } }}
                          />
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              </CardContent>
            </Card>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" fontWeight={800} mb={2}>
                  Unified Search Support
                </Typography>
                <Grid container spacing={1}>
                  <Grid item xs={12} sm={6} md={4}>
                    <FormControlLabel
                      control={<Checkbox checked={apiForm.supportsCnic} onChange={(e) => setApiForm((prev) => ({ ...prev, supportsCnic: e.target.checked }))} />}
                      label="CNIC"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <FormControlLabel
                      control={<Checkbox checked={apiForm.supportsPhone} onChange={(e) => setApiForm((prev) => ({ ...prev, supportsPhone: e.target.checked }))} />}
                      label="Mobile"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <FormControlLabel
                      control={<Checkbox checked={apiForm.supportsEngine} onChange={(e) => setApiForm((prev) => ({ ...prev, supportsEngine: e.target.checked }))} />}
                      label="Engine"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <FormControlLabel
                      control={<Checkbox checked={apiForm.supportsChassis} onChange={(e) => setApiForm((prev) => ({ ...prev, supportsChassis: e.target.checked }))} />}
                      label="Chassis"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <FormControlLabel
                      control={<Checkbox checked={apiForm.supportsReg} onChange={(e) => setApiForm((prev) => ({ ...prev, supportsReg: e.target.checked }))} />}
                      label="Vehicle Reg"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <FormControlLabel
                      control={<Checkbox checked={apiForm.supportsLicense} onChange={(e) => setApiForm((prev) => ({ ...prev, supportsLicense: e.target.checked }))} />}
                      label="License"
                    />
                  </Grid>
                </Grid>
                <TextField
                  fullWidth
                  sx={{ mt: 1 }}
                  label="Custom Regex"
                  value={apiForm.customRegex}
                  onChange={(e) => setApiForm((prev) => ({ ...prev, customRegex: e.target.value }))}
                  helperText="Optional. Used when this source should match a custom query pattern."
                />
              </CardContent>
            </Card>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" fontWeight={800} mb={1.5}>
                  Role Access
                </Typography>
                <Grid container spacing={1}>
                  <Grid item xs={12} sm={4}>
                    <FormControlLabel
                      control={<Checkbox checked={apiForm.allowUser} onChange={(e) => setApiForm((prev) => ({ ...prev, allowUser: e.target.checked }))} />}
                      label={getRoleLabel("USER")}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <FormControlLabel
                      control={<Checkbox checked={apiForm.allowReseller} onChange={(e) => setApiForm((prev) => ({ ...prev, allowReseller: e.target.checked }))} />}
                      label={getRoleLabel("RESELLER")}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <FormControlLabel
                      control={<Checkbox checked={apiForm.allowAdmin} onChange={(e) => setApiForm((prev) => ({ ...prev, allowAdmin: e.target.checked }))} />}
                      label={getRoleLabel("ADMIN")}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
            <Divider />
            <Typography variant="subtitle1" fontWeight={800}>
              Live Test Response
            </Typography>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
              <TextField fullWidth label="Test Query" value={testQuery} onChange={(e) => setTestQuery(e.target.value)} />
              <Button
                startIcon={<ScienceRoundedIcon />}
                variant="outlined"
                onClick={runLiveTest}
                disabled={!editingApi || testingApi}
              >
                Probe
              </Button>
            </Stack>
            <TextField fullWidth multiline minRows={8} value={testResponse} placeholder="Live response will appear here." />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { blurActiveElement(); setApiOpen(false); }}>Cancel</Button>
          <Button variant="contained" onClick={saveApi} disabled={saving}>
            Save API
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={serviceOpen} onClose={() => { blurActiveElement(); setServiceOpen(false); }} fullWidth fullScreen={isMobile} maxWidth="sm">
        <DialogTitle>{editingSvc ? "Edit Service" : "Add Service"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField label="Name" value={svcForm.name} onChange={(e) => setSvcForm((prev) => ({ ...prev, name: e.target.value }))} />
            <TextField
              label="Description"
              value={svcForm.description}
              onChange={(e) => setSvcForm((prev) => ({ ...prev, description: e.target.value }))}
            />
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField label="Icon" value={svcForm.icon} onChange={(e) => setSvcForm((prev) => ({ ...prev, icon: e.target.value }))} fullWidth />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Type" value={svcForm.type} onChange={(e) => setSvcForm((prev) => ({ ...prev, type: e.target.value }))} fullWidth />
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Default Cost"
                  value={svcForm.defaultCost}
                  onChange={(e) => setSvcForm((prev) => ({ ...prev, defaultCost: Number(e.target.value) }))}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={<Checkbox checked={svcForm.status} onChange={(e) => setSvcForm((prev) => ({ ...prev, status: e.target.checked }))} />}
                  label="Service enabled"
                />
              </Grid>
            </Grid>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" fontWeight={800} mb={0.75}>
                  Unified Search API Sources
                </Typography>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Enable only those APIs that should run for this service. Priority `1` runs first in the configured order.
                </Typography>
                <Stack spacing={1.25}>
                  {apis.map((apiItem) => {
                    const link = svcForm.links.find((item) => item.apiId === apiItem.id) ?? {
                      apiId: apiItem.id,
                      enabled: false,
                      priority: 1,
                    };
                    return (
                      <Box
                        key={apiItem.id}
                        sx={{
                          border: `1px solid ${ui.surface.border}`,
                          borderRadius: 2,
                          px: 1.5,
                          py: 1,
                        }}
                      >
                        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }}>
                          <Box sx={{ minWidth: 0 }}>
                            <FormControlLabel
                              control={<Checkbox checked={link.enabled} onChange={(e) => setServiceLinkEnabled(apiItem.id, e.target.checked)} />}
                              label={apiItem.name}
                            />
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", ml: 4 }}>
                              {apiItem.method} | {apiItem.creditsPerSearch ?? 1} credits
                            </Typography>
                          </Box>
                          <TextField
                            size="small"
                            type="number"
                            label="Priority"
                            value={link.priority}
                            disabled={!link.enabled}
                            onChange={(e) => setServiceLinkPriority(apiItem.id, Number(e.target.value))}
                            sx={{ width: { xs: "100%", md: 110 } }}
                          />
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { blurActiveElement(); setServiceOpen(false); }}>Cancel</Button>
          <Button variant="contained" onClick={saveService} disabled={saving}>
            Save Service
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
