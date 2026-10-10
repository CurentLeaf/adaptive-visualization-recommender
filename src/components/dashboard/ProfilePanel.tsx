import type { DataProfile } from '../../domain/types';

export function ProfilePanel({ profile }: { profile: DataProfile }) {
  return (
    <section className="panel">
      <h2>Dataset profile</h2>
      <p>
        Field metadata · {profile.rowCount} reports · {profile.fields.length} fields. Missing values
        remain missing; they are not treated as zero.
      </p>
      <div className="chips">
        <span>Time: {profile.temporalFields.join(', ')}</span>
        <span>Fictional coordinates: {profile.geographicFields.join(', ') || 'Not inferred'}</span>
        <span>Uncertainty: {profile.uncertaintyFields.length} fields</span>
        <span>Provenance: {profile.provenanceFields.length} fields</span>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Analytic role</th>
              <th>Scale</th>
              <th>Uncertainty</th>
              <th>Provenance</th>
              <th>Missing</th>
              <th>Unique</th>
              <th>Examples</th>
            </tr>
          </thead>
          <tbody>
            {profile.fields.map((field) => (
              <tr key={field.name}>
                <th scope="row">{field.name}</th>
                <td>{field.analyticRole}</td>
                <td>{field.scaleType}</td>
                <td>{field.isUncertainty ? 'Yes' : 'No'}</td>
                <td>{field.isProvenance ? 'Yes' : 'No'}</td>
                <td>
                  {(field.missingRate * 100).toFixed(1)}% ({field.nullableCount})
                </td>
                <td>{field.uniqueCount}</td>
                <td>{field.exampleValues.map(String).join(', ').slice(0, 85)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
