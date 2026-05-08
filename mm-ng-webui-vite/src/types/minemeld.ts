export type ApiEnvelope<T> = {
  result?: T;
  timestamp?: number;
  error?: string | { message?: string };
};

export type CurrentUser = {
  id: string;
  read_write: boolean;
  auth_method?: 'local' | 'oidc' | string;
  provider?: string;
  username?: string;
  role?: string;
};

export type AAAUserAttributes = {
  comment?: string;
  tags?: string[];
  role?: 'read-only' | 'read-write' | 'admin' | string;
  read_write?: boolean;
  auth_type?: 'local' | 'oidc' | string;
  auth_method?: 'local' | 'oidc' | string;
  [key: string]: unknown;
};

export type AAAUsers = {
  enabled: boolean;
  users: Record<string, AAAUserAttributes>;
};

export type AAAFeedAttributes = {
  comment?: string;
  tags?: string[];
  [key: string]: unknown;
};

export type AAAFeeds = {
  enabled: boolean;
  feeds: Record<string, AAAFeedAttributes>;
};

export type OidcConfig = {
  enabled: boolean;
  issuer_url: string;
  client_id: string;
  client_secret?: string;
  client_secret_configured?: boolean;
  scopes: string[];
  role_claim: string;
  role_mapping: Record<string, string>;
  redirect_uri?: string;
  post_login_redirect?: string;
  status?: 'disabled' | 'misconfigured' | 'active' | string;
};

export type OidcStatus = {
  enabled: boolean;
  status: 'disabled' | 'misconfigured' | 'active' | string;
};

export type NodeStatus = {
  name: string;
  length?: number;
  class?: string;
  inputs?: string[];
  output?: boolean;
  state?: number;
  sub_state?: string;
  sub_state_message?: string;
  last_run?: number | null;
  last_successful_run?: number | null;
  statistics?: Record<string, number>;
};

export type StatusByNode = Record<string, NodeStatus>;

export type CandidateConfigInfo = {
  fabric: boolean;
  mgmtbus: boolean;
  next_node_id: number;
  version: string;
  changed: boolean;
};

export type CandidateConfigNode = {
  name: string;
  properties: Record<string, unknown>;
  version: string;
  deleted?: boolean;
};

export type FullConfig = CandidateConfigInfo & {
  nodes: Array<CandidateConfigNode | null>;
};

export type CreateConfigNodeResult = {
  id: number;
  version: string;
};

export type RunningConfigNode = {
  prototype?: string;
  class?: string;
  node_type?: string;
  nodeType?: string;
  indicator_types?: string[];
  indicatorTypes?: string[];
  inputs?: string[];
  output?: boolean;
  config?: Record<string, unknown>;
};

export type RunningConfig = {
  nodes: Record<string, RunningConfigNode>;
};

export type MetricPoint = [number, number | null];

export type MetricSeries = {
  metric: string;
  values: MetricPoint[];
};

export type PrototypeMetadata = {
  description?: string;
  nodeType?: string;
  node_type?: string;
  indicatorTypes?: string[];
  indicator_types?: string[];
  tags?: string[];
  developmentStatus?: string;
  development_status?: string;
  author?: string;
};

export type Prototype = PrototypeMetadata & {
  class: string;
  config?: unknown;
};

export type PrototypePayload = {
  class: string;
  config?: string;
  developmentStatus?: string;
  nodeType?: string;
  description?: string;
  indicatorTypes?: string[];
  tags?: string[];
};

export type PrototypeLibrary = {
  description?: string;
  url?: string;
  prototypes?: Record<string, Prototype>;
};

export type PrototypeLibraries = Record<string, PrototypeLibrary>;

export type EngineInfo = {
  statename?: string;
  supervisor?: string;
  [key: string]: unknown;
};

export type ConfigDataType = 'yaml' | 'localdb';

export type WhitelistIndicator = {
  indicator?: string;
  type?: string;
  direction?: 'inbound' | 'outbound' | string;
  share_level?: 'green' | 'yellow' | 'red' | string;
  comment?: string;
  ttl?: number | 'disabled';
  removed?: boolean;
  _expiration_ts?: number | 'disabled' | null;
  _update_ts?: number | null;
  [key: string]: unknown;
};
