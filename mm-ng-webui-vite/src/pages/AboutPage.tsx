import { PageHeader } from '../components/PageHeader';

export function AboutPage() {
  return (
    <>
      <PageHeader title="About" description="mm-ng-webui-vite is the modern React WebUI foundation for mm-ng." />
      <section className="section-block">
        <dl className="definition-list">
          <div>
            <dt>Stack</dt>
            <dd>React, TypeScript, Vite, React Router, TanStack Query, Fetch API, Tailwind CSS</dd>
          </div>
          <div>
            <dt>Compatibility goal</dt>
            <dd>Feature parity with the AngularJS MineMeld WebUI without backend API changes.</dd>
          </div>
          <div>
            <dt>Authentication</dt>
            <dd>Local session login is active; backend-mediated OIDC can be enabled when mm-ng-core supports it.</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
