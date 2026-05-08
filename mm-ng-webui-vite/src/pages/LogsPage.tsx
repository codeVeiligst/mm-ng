import { useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router';
import { MineMeldApi } from '../api/minemeld';
import { EmptyState, ErrorState, LoadingState } from '../components/DataState';
import { PageHeader } from '../components/PageHeader';

type LogSource = 'engine' | 'web';
const logTailQueryVersion = 'tail-128kb';

function asLogSource(value: string | null): LogSource {
  return value === 'web' ? 'web' : 'engine';
}

export function LogsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const source = asLogSource(searchParams.get('source'));
  const [draft, setDraft] = useState(query);
  const logsQuery = useQuery({ queryKey: ['logs', source, logTailQueryVersion], queryFn: () => MineMeldApi.logs(source) });
  const logText = logsQuery.data ?? '';
  const filteredLogText = draft
    ? logText
        .split('\n')
        .filter((line) => line.toLowerCase().includes(draft.toLowerCase()))
        .join('\n')
    : logText;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSearchParams({ source, ...(draft ? { q: draft } : {}) });
  };

  return (
    <>
      <PageHeader title="Logs" description="Search the latest MineMeld engine or web log output." />
      <section className="section-block">
        <form className="toolbar" onSubmit={submit}>
          <select
            value={source}
            onChange={(event) => setSearchParams({ source: asLogSource(event.target.value), ...(draft ? { q: draft } : {}) })}
          >
            <option value="engine">Engine</option>
            <option value="web">Web</option>
          </select>
          <input value={draft} placeholder="Filter logs" onChange={(event) => setDraft(event.target.value)} />
          <button className="button primary" type="submit">
            Search
          </button>
        </form>
        {logsQuery.isLoading ? <LoadingState /> : null}
        {logsQuery.isError ? <ErrorState error={logsQuery.error} /> : null}
        {logsQuery.isSuccess && filteredLogText.trim().length === 0 ? (
          <EmptyState title="No log entries to display" detail="The selected log is empty or no lines match the current filter." />
        ) : null}
        {filteredLogText.trim().length > 0 ? (
          <pre className="log-output">{filteredLogText}</pre>
        ) : null}
      </section>
    </>
  );
}
