import { addQuery, apiFetch, unwrapResult } from './http';
import { normalizeStatusPayload } from '../utils/status';
import type {
  ApiEnvelope,
  AAAFeeds,
  AAAUserAttributes,
  AAAUsers,
  CurrentUser,
  CreateConfigNodeResult,
  ConfigDataType,
  EngineInfo,
  FullConfig,
  MetricSeries,
  OidcConfig,
  OidcStatus,
  PrototypePayload,
  PrototypeLibraries,
  RunningConfig,
  StatusByNode,
} from '../types/minemeld';

type UserSubsystem = 'api' | 'feeds';

export const MineMeldApi = {
  async login(username: string, password: string) {
    const body = new URLSearchParams({ u: username, p: password });

    await apiFetch<ApiEnvelope<unknown>>('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
  },

  async logout() {
    await apiFetch<ApiEnvelope<unknown>>('/api/logout', { method: 'POST' });
  },

  async currentUser() {
    return unwrapResult(await apiFetch<ApiEnvelope<CurrentUser>>('/aaa/users/current'));
  },

  async users(subsystem: UserSubsystem) {
    return unwrapResult(await apiFetch<ApiEnvelope<AAAUsers>>(`/aaa/users/${subsystem}`));
  },

  async setUserPassword(subsystem: UserSubsystem, username: string, password: string) {
    return unwrapResult(
      await apiFetch<ApiEnvelope<'ok'>>(`/aaa/users/${subsystem}/${encodeURIComponent(username)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      }),
    );
  },

  async setUserAttributes(subsystem: UserSubsystem, username: string, attributes: AAAUserAttributes) {
    return unwrapResult(
      await apiFetch<ApiEnvelope<'ok'>>(`/aaa/users/${subsystem}/${encodeURIComponent(username)}/attributes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(attributes),
      }),
    );
  },

  async deleteUser(subsystem: UserSubsystem, username: string) {
    return unwrapResult(
      await apiFetch<ApiEnvelope<'ok'>>(`/aaa/users/${subsystem}/${encodeURIComponent(username)}`, {
        method: 'DELETE',
      }),
    );
  },

  async feedAccess() {
    return unwrapResult(await apiFetch<ApiEnvelope<AAAFeeds>>('/aaa/feeds'));
  },

  async oidcConfig() {
    return unwrapResult(await apiFetch<ApiEnvelope<OidcConfig>>('/aaa/oidc/config'));
  },

  async oidcStatus() {
    return unwrapResult(await apiFetch<ApiEnvelope<OidcStatus>>('/auth/oidc/status'));
  },

  async setOidcConfig(config: OidcConfig) {
    return unwrapResult(
      await apiFetch<ApiEnvelope<OidcConfig>>('/aaa/oidc/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      }),
    );
  },

  async status() {
    const status = unwrapResult(await apiFetch<ApiEnvelope<StatusByNode | StatusByNode[keyof StatusByNode][]>>('/api/status'));
    return normalizeStatusPayload(status);
  },

  async hupNode(nodename: string) {
    return unwrapResult(await apiFetch<ApiEnvelope<'ok'>>(`/status/${encodeURIComponent(nodename)}/hup`));
  },

  async systemStatus() {
    return unwrapResult(await apiFetch<ApiEnvelope<Record<string, unknown>>>('/status/system'));
  },

  async minemeldStatus() {
    return await apiFetch<ApiEnvelope<unknown>>('/status/minemeld');
  },

  async engineStatus() {
    return unwrapResult(await apiFetch<ApiEnvelope<EngineInfo>>('/api/supervisor'));
  },

  async runningConfig() {
    return unwrapResult(await apiFetch<ApiEnvelope<RunningConfig>>('/config/running'));
  },

  async globalMetrics(params: { dt: number; r: number }) {
    const query = new URLSearchParams({ dt: String(params.dt), r: String(params.r) });
    return unwrapResult(await apiFetch<ApiEnvelope<MetricSeries[]>>(`/metrics/minemeld?${query.toString()}`));
  },

  async nodeTypeMetrics(nodeType: 'miners' | 'outputs' | 'processors', params: { dt: number; r: number }) {
    const query = new URLSearchParams({ dt: String(params.dt), r: String(params.r) });
    return unwrapResult(await apiFetch<ApiEnvelope<MetricSeries[]>>(`/metrics/minemeld/${nodeType}?${query.toString()}`));
  },

  async fullConfig() {
    return unwrapResult(await apiFetch<ApiEnvelope<FullConfig>>('/config/full'));
  },

  async commitConfig(version: string) {
    return unwrapResult(
      await apiFetch<ApiEnvelope<'OK'>>('/config/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ version }),
      }),
    );
  },

  async reloadConfig(source: 'running' | 'committed') {
    const query = new URLSearchParams({ c: source });
    return unwrapResult(await apiFetch<ApiEnvelope<string>>(`/config/reload?${query.toString()}`));
  },

  async restartEngine() {
    return unwrapResult(await apiFetch<ApiEnvelope<'OK'>>('/supervisor/minemeld-engine/restart', { method: 'POST' }));
  },

  async createConfigNode(body: { version: string; name: string; properties: Record<string, unknown> }) {
    return unwrapResult(
      await apiFetch<ApiEnvelope<CreateConfigNodeResult>>('/config/node', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
    );
  },

  async updateConfigNode(nodenum: number, body: { version: string; name: string; properties: Record<string, unknown> }) {
    return unwrapResult(
      await apiFetch<ApiEnvelope<string>>(`/config/node/${nodenum}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
    );
  },

  async deleteConfigNode(nodenum: number, version: string) {
    const query = new URLSearchParams({ version });
    return unwrapResult(
      await apiFetch<ApiEnvelope<'OK'>>(`/config/node/${nodenum}?${query.toString()}`, {
        method: 'DELETE',
      }),
    );
  },

  async configData<T>(datafilename: string, type: ConfigDataType = 'yaml') {
    return unwrapResult(await apiFetch<ApiEnvelope<T>>(addQuery(`/config/data/${encodeURIComponent(datafilename)}`, { t: type })));
  },

  async saveConfigData<T>(datafilename: string, data: T, type: ConfigDataType = 'yaml', hup?: string) {
    return unwrapResult(
      await apiFetch<ApiEnvelope<'ok'>>(addQuery(`/config/data/${encodeURIComponent(datafilename)}`, { t: type, h: hup }), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }),
    );
  },

  async appendConfigData<T>(datafilename: string, data: T, type: ConfigDataType = 'yaml', hup?: string) {
    return unwrapResult(
      await apiFetch<ApiEnvelope<'ok'>>(addQuery(`/config/data/${encodeURIComponent(datafilename)}/append`, { t: type, h: hup }), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }),
    );
  },

  async prototypes() {
    return unwrapResult(await apiFetch<ApiEnvelope<PrototypeLibraries>>('/prototype'));
  },

  async createPrototype(prototypeName: string, body: PrototypePayload) {
    return unwrapResult(
      await apiFetch<ApiEnvelope<'OK'>>(`/prototype/${encodeURIComponent(prototypeName)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
    );
  },

  async deletePrototype(prototypeName: string) {
    return unwrapResult(
      await apiFetch<ApiEnvelope<'OK'>>(`/prototype/${encodeURIComponent(prototypeName)}`, {
        method: 'DELETE',
      }),
    );
  },

  async logs(source: 'engine' | 'web' = 'engine') {
    return await apiFetch<string>(`/api/logs/${source}`, {
      headers: {
        Range: 'bytes=-131072',
      },
    });
  },

  async extensions() {
    return unwrapResult(await apiFetch<ApiEnvelope<unknown>>('/extensions'));
  },
};
