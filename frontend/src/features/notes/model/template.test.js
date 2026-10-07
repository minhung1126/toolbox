import { describe, expect, it } from 'vitest';
import { renderTemplate, templateVariables } from './template';

describe('note templates', () => {
  it('deduplicates variable names in order and supports Chinese names', () => {
    expect(templateVariables('{name} {姓名} {name} {empty space} {}')).toEqual(['name', '姓名']);
  });

  it('replaces repeated variables literally without recursive substitution', () => {
    expect(renderTemplate('{name}\n{name} {other}', { name: '$& {other}', other: 'min' })).toBe(
      '$& {other}\n$& {other} min'
    );
  });

  it('preserves missing and empty variables, including inherited object names', () => {
    expect(renderTemplate('{name} {missing} {toString}', { name: '' })).toBe('{name} {missing} {toString}');
    expect(renderTemplate('{name}', { name: '0' })).toBe('0');
  });
});
