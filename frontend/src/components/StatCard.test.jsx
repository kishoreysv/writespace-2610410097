/** @module stat-card-tests Verify exact metric names, explanations and boundary counts. */
import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { StatCard } from './StatCard';

it.each(['Total Posts', 'Total Users', 'Total Admins', 'Total users'])('renders exact %s label and count with explanatory text', (label) => {
  render(<StatCard label={label} count={12} description="Stored writer accounts only." />);
  const region = screen.getByRole('region', { name: label, exact: true });
  expect(within(region).getByRole('heading', { name: label, exact: true })).toBeInTheDocument();
  expect(within(region).getByText('12')).toHaveClass('tabular-nums');
  expect(within(region).getByText('Stored writer accounts only.')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it.each([0, -1, NaN, Infinity])('shows safe zero for count %s and omits absent description', (count) => {
  render(<StatCard label="Total Posts" count={count} />);
  const region = screen.getByRole('region', { name: 'Total Posts' });
  expect(within(region).getByText('0')).toBeInTheDocument();
  expect(region.querySelectorAll('p')).toHaveLength(1);
});

it('renders text rather than interpreting markup in labels or descriptions', () => {
  render(<StatCard label="<img onerror=alert(1)>" count={1} description="<script>demo</script>" />);
  expect(screen.getByRole('heading')).toHaveTextContent('<img onerror=alert(1)>');
  expect(document.querySelector('img, script')).toBeNull();
});
