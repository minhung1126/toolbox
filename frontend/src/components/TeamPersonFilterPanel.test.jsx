import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import TeamPersonFilterPanel from './TeamPersonFilterPanel';
import { personKey } from '../features/sheets/model/personOptions';

const a = { team: 'Team A', person: '甲', kind: 'person', aliases: ['Alpha'] };
const b = { team: 'Team B', person: '乙', kind: 'person', team_aliases: ['Bravo'] };
const c = { team: 'Team B', person: '甲', kind: 'person' };
function Harness({ initial = [], ...props }) {
  const [selected, setSelected] = useState(initial);
  const [teams, setTeams] = useState([]);
  const [query, setQuery] = useState('');
  return (
    <TeamPersonFilterPanel
      teams={['Team A', 'Team B']}
      people={[a, b, c]}
      selectedTeams={teams}
      onTeamsChange={setTeams}
      query={query}
      onQueryChange={setQuery}
      selectedPeople={selected}
      onSelectedPeopleChange={setSelected}
      {...props}
    />
  );
}
afterEach(() => vi.useRealTimers());
describe('TeamPersonFilterPanel', () => {
  it('keeps cross-team choices through searches, handles aliases and matches all terms', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('checkbox', { name: '甲 Team A' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  BRAVO 乙 ' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.click(screen.getByRole('checkbox', { name: '乙 Team B' }));
    expect(screen.getByRole('button', { name: '移除 甲 · Team A' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清除人物搜尋' }));
    expect(screen.getByRole('checkbox', { name: '甲 Team A' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '乙 Team B' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '甲 Team B' })).not.toBeChecked();
  });
  it('only selects and deselects current results; team filters use OR and intersect search', () => {
    render(<Harness initial={[personKey(a)]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Team B', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '選取目前結果', exact: true }));
    expect(screen.getByText('符合 2 人・已選 3 人')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '取消選取目前結果', exact: true }));
    expect(screen.getByRole('button', { name: '移除 甲 · Team A' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Team A', exact: true }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'alpha' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });
  it('separates reset, clear and undo, and can remove hidden selected people', () => {
    render(<Harness initial={[personKey(a), personKey(b)]} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nothing' } });
    expect(screen.getByText('找不到符合的人物')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清空選擇' }));
    expect(screen.getByText('未限定人物')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('nothing');
    expect(screen.getByRole('button', { name: '清空選擇' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '復原', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '重設篩選' }));
    expect(screen.getByText('符合 3 人・已選 2 人')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '移除 乙 · Team B' }));
    expect(screen.getByText('符合 3 人・已選 1 人')).toBeInTheDocument();
  });
  it('expires undo after six seconds and disables interactions while loading', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Harness initial={[personKey(a)]} />);
    fireEvent.click(screen.getByRole('button', { name: '清空選擇' }));
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.queryByRole('button', { name: '復原', exact: true })).not.toBeInTheDocument();
    rerender(<Harness loadingPeople />);
    expect(screen.getByRole('searchbox')).toBeDisabled();
    expect(screen.getByText('讀取中…')).toBeInTheDocument();
  });
});
