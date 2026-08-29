// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { computeAccessibleName } from 'dom-accessibility-api';
import { afterEach, describe, expect, it } from 'vitest';
import { Field, Segmented, Slider, TextInput } from './primitives';

afterEach(cleanup);

describe('Field + Segmented accessibility', () => {
  it('radios keep option-only accessible names; the group is labelled by the field caption', () => {
    render(
      <Field label="Position" hint="Where captions sit">
        <Segmented value="top" onChange={() => undefined} options={[{ value: 'top', label: 'Top' }, { value: 'center', label: 'Centre' }, { value: 'bottom', label: 'Bottom' }]} />
      </Field>,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => computeAccessibleName(r))).toEqual(['Top', 'Centre', 'Bottom']);
    expect(computeAccessibleName(screen.getByRole('radiogroup'))).toBe('Position');
    expect(screen.getByRole('radio', { name: 'Top' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Top' }).getAttribute('aria-checked')).toBe('true');
  });

  it('never nests interactive controls inside a <label>', () => {
    const { container } = render(
      <div>
        <Field label="Size">
          <Slider value={0.05} min={0} max={0.1} step={0.01} onChange={() => undefined} format={(v) => `${v}`} />
        </Field>
        <Field label="Title">
          <TextInput defaultValue="x" />
        </Field>
        <Field label="Weight">
          <Segmented value="400" onChange={() => undefined} options={[{ value: '400', label: '400' }, { value: '700', label: '700' }]} />
        </Field>
      </div>,
    );
    const nested = container.querySelectorAll('label button, label input, label [role="radio"], label [role="radiogroup"]');
    expect(nested.length).toBe(0);
  });

  it('sliders and inputs inside a Field take the caption as their accessible name', () => {
    render(
      <div>
        <Field label="Size">
          <Slider value={0.05} min={0} max={0.1} step={0.01} onChange={() => undefined} format={(v) => `${Math.round(v * 100)}%`} />
        </Field>
        <Field label="Spoken language">
          <TextInput defaultValue="" placeholder="auto" />
        </Field>
      </div>,
    );
    expect(computeAccessibleName(screen.getByRole('slider'))).toBe('Size');
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('5%');
    expect(computeAccessibleName(screen.getByRole('textbox'))).toBe('Spoken language');
  });

  it('standalone controls keep explicit labels', () => {
    render(
      <div>
        <Segmented label="Tab" value="a" onChange={() => undefined} options={[{ value: 'a', label: 'A' }]} />
        <Slider label="Volume" value={1} min={0} max={2} onChange={() => undefined} />
        <TextInput aria-label="Search" />
      </div>,
    );
    expect(computeAccessibleName(screen.getByRole('radiogroup'))).toBe('Tab');
    expect(computeAccessibleName(screen.getByRole('slider'))).toBe('Volume');
    expect(computeAccessibleName(screen.getByRole('textbox'))).toBe('Search');
  });
});
