// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PricingSection } from './PricingSection';

afterEach(cleanup);

describe('PricingSection', () => {
  it('switches every paid plan to the annual catalog with visible savings', () => {
    render(<PricingSection />);

    const monthly = screen.getByRole('button', { name: 'Monthly' });
    const annual = screen.getByRole('button', { name: 'Annual Save 15%' });
    expect(monthly.getAttribute('aria-pressed')).toBe('true');
    expect(annual.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('$39')).toBeTruthy();

    fireEvent.click(annual);

    expect(monthly.getAttribute('aria-pressed')).toBe('false');
    expect(annual.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('$12.75')).toBeTruthy();
    expect(screen.getByText('$33.17')).toBeTruthy();
    expect(screen.getByText('$84.17')).toBeTruthy();
    expect(screen.getByText('Billed $153 annually · Includes 3,600 credits for the year.')).toBeTruthy();
    expect(screen.getByText('Billed $398 annually · Includes 12,000 credits for the year.')).toBeTruthy();
    expect(screen.getByText('Billed $1,010 annually · Includes 36,000 credits for the year.')).toBeTruthy();
    expect(screen.getAllByText('Agent and API access')).toHaveLength(4);
  });
});
