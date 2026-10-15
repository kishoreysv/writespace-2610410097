/** @module StatCard Display a read-only labeled administration metric. */
import PropTypes from 'prop-types';

/** Render one accessible metric with a short explanation of its population.
 * @param {{label: string, count: number, description?: string}} props Metric presentation.
 * @returns {import('react').ReactElement} Named metric section.
 */
export function StatCard({ label, count, description = '' }) {
  const value = Number.isFinite(count) && count >= 0 ? count : 0;
  return (
    <section aria-label={label} className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="font-semibold text-slate-600">
        {label}
      </h2>
      <p className="mt-2 font-display text-4xl font-bold tabular-nums text-slate-800">
        {value}
      </p>
      {description && (
        <p className="mt-3 text-sm text-slate-600">
          {description}
        </p>
      )}
    </section>
  );
}

StatCard.propTypes = {
  label: PropTypes.string.isRequired,
  count: PropTypes.number.isRequired,
  description: PropTypes.string,
};
