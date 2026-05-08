import { EmptyState } from '../components/DataState';
import { PageHeader } from '../components/PageHeader';

export function IndicatorAddPage() {
  return (
    <>
      <PageHeader title="Add Indicator" description="Foundation page for local table and feed indicator workflows." />
      <section className="section-block">
        <EmptyState
          title="Indicator workflow pending"
          detail="The route accepts the legacy indicator and indicatorType query parameters for incremental implementation."
        />
      </section>
    </>
  );
}
