import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet } from 'react-router';
import { MineMeldApi } from '../api/minemeld';
import { ConfirmModal } from '../components/ConfirmModal';
import { ErrorState, LoadingState } from '../components/DataState';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/useAuth';
import { displayUsername } from '../utils/authDisplay';
import type { AAAFeedAttributes, AAAUserAttributes, OidcConfig } from '../types/minemeld';

type UserRow = {
  username: string;
  attrs: AAAUserAttributes;
};

type FeedUserRow = {
  username: string;
  attrs: AAAUserAttributes;
  feeds: string[];
};

const defaultOidcConfig: OidcConfig = {
  enabled: false,
  issuer_url: '',
  client_id: '',
  scopes: ['openid', 'profile', 'email'],
  role_claim: 'roles',
  role_mapping: {
    admin: 'admin',
    read_write: 'read-write',
    read_only: 'read-only',
  },
  redirect_uri: '',
  post_login_redirect: '/status',
};

function tags(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function userRows(users: Record<string, AAAUserAttributes> | undefined): UserRow[] {
  return Object.entries(users ?? {})
    .map(([username, attrs]) => ({ username, attrs }))
    .sort((a, b) => a.username.localeCompare(b.username));
}

function authType(attrs: AAAUserAttributes) {
  return attrs.auth_type || attrs.auth_method || 'local';
}

function roleFor(attrs: AAAUserAttributes) {
  if (attrs.role) {
    return String(attrs.role);
  }

  if (attrs.read_write === false) {
    return 'read-only';
  }

  return 'read-write';
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = normalized.includes('active') || normalized.includes('enabled') ? 'good' : normalized.includes('mis') ? 'warn' : 'neutral';
  return <span className={`status-badge ${tone}`}>{value}</span>;
}

function LocalUserRow({
  row,
  canWrite,
  onSave,
  onPassword,
  onDelete,
}: {
  row: UserRow;
  canWrite: boolean;
  onSave: (username: string, attrs: AAAUserAttributes) => Promise<void>;
  onPassword: (username: string, password: string) => Promise<void>;
  onDelete: (username: string) => Promise<void>;
}) {
  const [role, setRole] = useState(roleFor(row.attrs));
  const [comment, setComment] = useState(row.attrs.comment ?? '');
  const [password, setPassword] = useState('');
  const managedByOidc = authType(row.attrs) === 'oidc';

  useEffect(() => {
    setRole(roleFor(row.attrs));
    setComment(row.attrs.comment ?? '');
  }, [row.attrs]);

  return (
    <tr>
      <td>
        <strong>{row.username}</strong>
      </td>
      <td>
        <select value={role} disabled={!canWrite || managedByOidc} onChange={(event) => setRole(event.target.value)}>
          <option value="read-only">read-only</option>
          <option value="read-write">read-write</option>
          <option value="admin">admin</option>
        </select>
      </td>
      <td>
        <span className={`node-type-badge ${managedByOidc ? 'output' : 'miner'}`}>{managedByOidc ? 'OIDC' : 'Local'}</span>
      </td>
      <td>
        <input value={comment} disabled={!canWrite || managedByOidc} onChange={(event) => setComment(event.target.value)} />
      </td>
      <td>
        <div className="inline-actions">
          <button
            type="button"
            className="button secondary"
            disabled={!canWrite || managedByOidc}
            onClick={() => onSave(row.username, { ...row.attrs, role, comment, auth_type: 'local' })}
          >
            Save
          </button>
          <input
            value={password}
            type="password"
            placeholder="New password"
            disabled={!canWrite || managedByOidc}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            type="button"
            className="button secondary"
            disabled={!canWrite || managedByOidc || password.length === 0}
            onClick={() => onPassword(row.username, password).then(() => setPassword(''))}
          >
            Set password
          </button>
          <button
            type="button"
            className="button danger"
            disabled={!canWrite || managedByOidc}
            onClick={() => onDelete(row.username)}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

export function AdminLayout() {
  return (
    <>
      <PageHeader title="Admin" description="Local users, feed users, authentication, and access management." />
      <nav className="tab-strip route-tabs">
        <NavLink to="/admin/users">Users</NavLink>
        <NavLink to="/admin/fusers">Feed Users</NavLink>
        <NavLink to="/admin/authentication">Authentication</NavLink>
      </nav>
      <Outlet />
    </>
  );
}

export function AdminUsersPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const usersQuery = useQuery({ queryKey: ['aaa', 'users', 'api'], queryFn: () => MineMeldApi.users('api') });
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'read-write', comment: '' });
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const createUser = useMutation({
    mutationFn: async () => {
      const username = newUser.username.trim();
      if (!username || !newUser.password) {
        throw new Error('Username and password are required');
      }
      if (usersQuery.data?.users[username]) {
        throw new Error('User already exists');
      }

      await MineMeldApi.setUserPassword('api', username, newUser.password);
      await MineMeldApi.setUserAttributes('api', username, {
        role: newUser.role,
        comment: newUser.comment,
        auth_type: 'local',
      });
    },
    onSuccess: async () => {
      setNewUser({ username: '', password: '', role: 'read-write', comment: '' });
      await queryClient.invalidateQueries({ queryKey: ['aaa', 'users', 'api'] });
    },
  });

  const saveAttrs = useMutation({
    mutationFn: ({ username, attrs }: { username: string; attrs: AAAUserAttributes }) =>
      MineMeldApi.setUserAttributes('api', username, attrs),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['aaa', 'users', 'api'] }),
  });

  const setPassword = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) => MineMeldApi.setUserPassword('api', username, password),
  });

  const deleteUser = useMutation({
    mutationFn: (username: string) => MineMeldApi.deleteUser('api', username),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['aaa', 'users', 'api'] }),
  });

  const rows = userRows(usersQuery.data?.users);
  const mutationError = createUser.error || saveAttrs.error || setPassword.error || deleteUser.error;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    createUser.mutate();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    await deleteUser.mutateAsync(deleteTarget);
    setDeleteTarget(null);
  };

  if (usersQuery.isLoading) {
    return (
      <section className="section-block">
        <LoadingState label="Loading users" />
      </section>
    );
  }

  if (usersQuery.isError) {
    return (
      <section className="section-block">
        <ErrorState error={usersQuery.error} />
      </section>
    );
  }

  return (
    <>
      <section className="section-block">
        <div className="section-heading">
          <div>
            <h2>Local users</h2>
            <p>API users backed by the legacy MineMeld local user database.</p>
          </div>
          <StatusBadge value={usersQuery.data?.enabled ? 'enabled' : 'disabled'} />
        </div>
        {auth.method === 'oidc' ? (
          <div className="notice-state">You are signed in with OIDC as {displayUsername(auth.user)}. OIDC users are externally managed.</div>
        ) : null}
        {mutationError ? <ErrorState error={mutationError} /> : null}
        <form className="admin-form" onSubmit={submit}>
          <label>
            Username
            <input value={newUser.username} disabled={!auth.isReadWrite} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} />
          </label>
          <label>
            Password
            <input
              value={newUser.password}
              type="password"
              disabled={!auth.isReadWrite}
              onChange={(event) => setNewUser({ ...newUser, password: event.target.value })}
            />
          </label>
          <label>
            Role
            <select value={newUser.role} disabled={!auth.isReadWrite} onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}>
              <option value="read-only">read-only</option>
              <option value="read-write">read-write</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <label>
            Comment
            <input value={newUser.comment} disabled={!auth.isReadWrite} onChange={(event) => setNewUser({ ...newUser, comment: event.target.value })} />
          </label>
          <button className="button primary" type="submit" disabled={!auth.isReadWrite || createUser.isPending}>
            Create user
          </button>
        </form>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Auth type</th>
                <th>Comment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <LocalUserRow
                  key={row.username}
                  row={row}
                  canWrite={auth.isReadWrite}
                  onSave={async (username, attrs) => {
                    await saveAttrs.mutateAsync({ username, attrs });
                  }}
                  onPassword={async (username, password) => {
                    await setPassword.mutateAsync({ username, password });
                  }}
                  onDelete={async (username) => setDeleteTarget(username)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {deleteTarget ? (
        <ConfirmModal title="Delete local user" pending={deleteUser.isPending} onConfirm={() => void confirmDelete()} onCancel={() => setDeleteTarget(null)}>
          <p>
            Delete local user <strong>{deleteTarget}</strong>?
          </p>
        </ConfirmModal>
      ) : null}
    </>
  );
}

function associatedFeeds(userAttrs: AAAUserAttributes, feeds: Record<string, AAAFeedAttributes> | undefined) {
  const userTags = new Set(tags(userAttrs.tags));
  if (userTags.size === 0) {
    return [];
  }

  return Object.entries(feeds ?? {})
    .filter(([, feedAttrs]) => {
      const feedTags = tags(feedAttrs.tags);
      return feedTags.includes('any') || feedTags.some((tag) => userTags.has(tag));
    })
    .map(([feedname]) => feedname)
    .sort((a, b) => a.localeCompare(b));
}

export function AdminFeedsPage() {
  const feedUsersQuery = useQuery({ queryKey: ['aaa', 'users', 'feeds'], queryFn: () => MineMeldApi.users('feeds') });
  const feedsQuery = useQuery({ queryKey: ['aaa', 'feeds'], queryFn: MineMeldApi.feedAccess });

  const rows = useMemo<FeedUserRow[]>(() => {
    return userRows(feedUsersQuery.data?.users).map((row) => ({
      username: row.username,
      attrs: row.attrs,
      feeds: associatedFeeds(row.attrs, feedsQuery.data?.feeds),
    }));
  }, [feedUsersQuery.data?.users, feedsQuery.data?.feeds]);

  if (feedUsersQuery.isLoading || feedsQuery.isLoading) {
    return (
      <section className="section-block">
        <LoadingState label="Loading feed users" />
      </section>
    );
  }

  if (feedUsersQuery.isError || feedsQuery.isError) {
    return (
      <section className="section-block">
        <ErrorState error={feedUsersQuery.error || feedsQuery.error} />
      </section>
    );
  }

  return (
    <section className="section-block">
      <div className="section-heading">
        <div>
          <h2>Feed users</h2>
          <p>Feed authentication users and their tag-based feed permissions. This view is read-only in the new UI.</p>
        </div>
        <StatusBadge value={feedUsersQuery.data?.enabled ? 'enabled' : 'disabled'} />
      </div>
      {!feedUsersQuery.data?.enabled ? <div className="notice-state">Feed authentication is disabled. Anonymous feed access follows backend feed settings.</div> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Auth type</th>
              <th>Permissions</th>
              <th>Associated feeds</th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.username}>
                <td>
                  <strong>{row.username}</strong>
                </td>
                <td>
                  <span className="node-type-badge miner">Local</span>
                </td>
                <td>{tags(row.attrs.tags).join(', ') || '-'}</td>
                <td>{row.feeds.join(', ') || '-'}</td>
                <td>{row.attrs.comment ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AdminAuthenticationPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const oidcQuery = useQuery({ queryKey: ['aaa', 'oidc', 'config'], queryFn: MineMeldApi.oidcConfig });
  const [form, setForm] = useState<OidcConfig>(defaultOidcConfig);
  const [scopeText, setScopeText] = useState(defaultOidcConfig.scopes.join(' '));
  const [roleMappingText, setRoleMappingText] = useState(JSON.stringify(defaultOidcConfig.role_mapping, null, 2));
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!oidcQuery.data) {
      return;
    }

    const next = { ...defaultOidcConfig, ...oidcQuery.data };
    setForm(next);
    setScopeText((next.scopes ?? defaultOidcConfig.scopes).join(' '));
    setRoleMappingText(JSON.stringify(next.role_mapping ?? defaultOidcConfig.role_mapping, null, 2));
  }, [oidcQuery.data]);

  const saveOidc = useMutation({
    mutationFn: (config: OidcConfig) => MineMeldApi.setOidcConfig(config),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['aaa', 'oidc', 'config'] });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    let roleMapping: Record<string, string>;
    try {
      roleMapping = JSON.parse(roleMappingText) as Record<string, string>;
      if (!roleMapping || typeof roleMapping !== 'object' || Array.isArray(roleMapping)) {
        throw new Error('Role mapping must be a JSON object');
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Invalid role mapping JSON');
      return;
    }

    saveOidc.mutate({
      ...form,
      scopes: scopeText
        .split(/[,\s]+/)
        .map((scope) => scope.trim())
        .filter(Boolean),
      role_mapping: roleMapping,
    });
  };

  if (oidcQuery.isLoading) {
    return (
      <section className="section-block">
        <LoadingState label="Loading authentication settings" />
      </section>
    );
  }

  if (oidcQuery.isError) {
    return (
      <section className="section-block">
        <ErrorState error={oidcQuery.error} />
      </section>
    );
  }

  return (
    <section className="section-block">
      <div className="section-heading">
        <div>
          <h2>Authentication</h2>
          <p>Local authentication remains enabled. OIDC is additive and must be explicitly configured before the login button is exposed.</p>
        </div>
        <StatusBadge value={oidcQuery.data?.status ?? 'disabled'} />
      </div>
      {formError ? <div className="form-error">{formError}</div> : null}
      {saveOidc.error ? <ErrorState error={saveOidc.error} /> : null}
      <form className="admin-form auth-form" onSubmit={submit}>
        <label className="checkbox-label">
          <input type="checkbox" checked={form.enabled} disabled={!auth.isReadWrite} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
          Enable OIDC
        </label>
        <label>
          Issuer URL
          <input value={form.issuer_url} disabled={!auth.isReadWrite} onChange={(event) => setForm({ ...form, issuer_url: event.target.value })} />
        </label>
        <label>
          Client ID
          <input value={form.client_id} disabled={!auth.isReadWrite} onChange={(event) => setForm({ ...form, client_id: event.target.value })} />
        </label>
        <label>
          Client secret
          <input
            value={form.client_secret ?? ''}
            type="password"
            placeholder={form.client_secret_configured ? 'Configured; leave blank to keep' : ''}
            disabled={!auth.isReadWrite}
            onChange={(event) => setForm({ ...form, client_secret: event.target.value })}
          />
        </label>
        <label>
          Scopes
          <input value={scopeText} disabled={!auth.isReadWrite} onChange={(event) => setScopeText(event.target.value)} />
        </label>
        <label>
          Role claim
          <input value={form.role_claim} disabled={!auth.isReadWrite} onChange={(event) => setForm({ ...form, role_claim: event.target.value })} />
        </label>
        <label>
          Redirect URI
          <input
            value={form.redirect_uri ?? ''}
            placeholder="/auth/oidc/callback"
            disabled={!auth.isReadWrite}
            onChange={(event) => setForm({ ...form, redirect_uri: event.target.value })}
          />
        </label>
        <label className="wide-field">
          Claim to role mapping
          <textarea value={roleMappingText} disabled={!auth.isReadWrite} rows={7} onChange={(event) => setRoleMappingText(event.target.value)} />
        </label>
        <button className="button primary" type="submit" disabled={!auth.isReadWrite || saveOidc.isPending}>
          Save authentication
        </button>
      </form>
    </section>
  );
}
