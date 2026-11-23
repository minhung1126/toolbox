import React, { useEffect, useId, useState } from 'react';
import { Search, Users, X } from 'lucide-react';
import { Button } from '../shared/ui';
import { EmptyState, StatusMessage } from './StatusMessage';
import { matchesPersonSearch, personKey, personLabel, personName } from '../features/sheets/model/personOptions';

export default function TeamPersonFilterPanel({
  teams = [],
  selectedTeams = [],
  onTeamsChange,
  query = '',
  onQueryChange,
  people = [],
  selectedPeople = [],
  onSelectedPeopleChange,
  loading = false,
  loadingTeams = false,
  loadingPeople = false,
  error = '',
  disabled = false,
  description = '直接搜尋並選取不同團體的人物；搜尋與團體篩選會保留已選人物。',
}) {
  const queryId = useId();
  const [expanded, setExpanded] = useState(false);
  const [undo, setUndo] = useState(null);
  const busy = disabled || loading || loadingTeams || loadingPeople;
  const results = people.filter(
    (person) => (!selectedTeams.length || selectedTeams.includes(person.team)) && matchesPersonSearch(person, query)
  );
  const resultKeys = results.map(personKey);
  const resultKeySet = new Set(resultKeys);
  const selectedSet = new Set(selectedPeople);
  const hasFilters = Boolean(query || selectedTeams.length);
  const resetFilters = () => {
    onQueryChange('');
    onTeamsChange([]);
  };
  useEffect(() => {
    if (!undo) return undefined;
    const timer = window.setTimeout(() => setUndo(null), 6000);
    return () => window.clearTimeout(timer);
  }, [undo]);
  const changeSelection = (next) => {
    setUndo(null);
    onSelectedPeopleChange(next);
  };

  return (
    <section className={`filter-panel${disabled ? ' filter-panel-disabled' : ''}`} aria-label="團體與人物篩選">
      <div className="filter-panel-header">
        <div className="filter-panel-heading-group">
          <strong>
            <Users size={17} aria-hidden="true" />
            團體與人物篩選
          </strong>
          <p>{description}</p>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor={queryId}>
          <Search size={14} aria-hidden="true" />
          搜尋人物／團體
        </label>
        <div className="person-search-field">
          <input
            id={queryId}
            className="form-input"
            type="search"
            maxLength={1000}
            value={query}
            placeholder="搜尋人物或團體"
            onChange={(event) => onQueryChange(event.target.value)}
            disabled={busy}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label="清除人物搜尋"
            disabled={busy || !query}
            onClick={() => onQueryChange('')}
          >
            <X size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="person-team-filters" role="group" aria-label="團體快速篩選">
        <button
          type="button"
          className={`person-filter-chip${!selectedTeams.length ? ' is-active' : ''}`}
          aria-pressed={!selectedTeams.length}
          disabled={busy}
          onClick={() => onTeamsChange([])}
        >
          全部團體
        </button>
        {teams.map((team) => (
          <button
            key={team}
            type="button"
            className={`person-filter-chip${selectedTeams.includes(team) ? ' is-active' : ''}`}
            aria-pressed={selectedTeams.includes(team)}
            disabled={busy}
            onClick={() =>
              onTeamsChange(
                selectedTeams.includes(team) ? selectedTeams.filter((item) => item !== team) : [...selectedTeams, team]
              )
            }
          >
            {team}
          </button>
        ))}
      </div>
      <div className="person-selected-area">
        <div className="filter-panel-people-header">
          <strong>已選人物（{selectedPeople.length}）</strong>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy || !selectedPeople.length}
            onClick={() => {
              setUndo([...selectedPeople]);
              onSelectedPeopleChange([]);
            }}
          >
            清空選擇
          </Button>
        </div>
        {!selectedPeople.length && <p className="filter-panel-status">未限定人物</p>}
        <div className={`person-selected-tags${expanded ? ' is-expanded' : ''}`}>
          {selectedPeople.map((key, index) => (
            <button
              type="button"
              key={key}
              className={`person-filter-chip${index >= 5 ? ' person-selected-overflow' : ''}`}
              disabled={busy}
              aria-label={`移除 ${personLabel(key)}`}
              onClick={() => changeSelection(selectedPeople.filter((item) => item !== key))}
            >
              {personLabel(key)}
              <X size={13} aria-hidden="true" />
            </button>
          ))}
        </div>
        {selectedPeople.length > 5 && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="person-selected-expand"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? '收合已選人物' : `查看全部已選（${selectedPeople.length}）`}
          </Button>
        )}
        {undo && (
          <div className="person-selection-undo" role="status">
            已清空選擇
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                onSelectedPeopleChange(undo);
                setUndo(null);
              }}
            >
              復原
            </Button>
          </div>
        )}
      </div>
      <div className="filter-panel-people">
        <div className="filter-panel-people-header">
          <h2 aria-live="polite">
            符合 {results.length} 人・已選 {selectedPeople.length} 人
          </h2>
          <Button type="button" variant="secondary" size="sm" disabled={busy || !hasFilters} onClick={resetFilters}>
            重設篩選
          </Button>
        </div>
        {disabled && <EmptyState>請先刷新資料來源與工作表。</EmptyState>}
        {(loading || loadingTeams || loadingPeople) && <StatusMessage>讀取中…</StatusMessage>}
        {!busy && error && (
          <StatusMessage tone="error" status="failed" title="人物資料讀取失敗">
            {error}
          </StatusMessage>
        )}
        {!busy && !error && !results.length && <EmptyState>找不到符合的人物</EmptyState>}
        {!!results.length && (
          <div className="filter-option-grid">
            {results.map((person) => {
              const key = personKey(person);
              const selected = selectedSet.has(key);
              return (
                <label key={key} className={`filter-option${selected ? ' filter-option-selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={busy}
                    onChange={() =>
                      changeSelection(
                        selected ? selectedPeople.filter((item) => item !== key) : [...selectedPeople, key]
                      )
                    }
                  />
                  <span>
                    {personName(person)}
                    <small className="person-option-team">{person.team || '未分團體'}</small>
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <div className="person-result-actions">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy || !resultKeys.some((key) => !selectedSet.has(key))}
            onClick={() => changeSelection([...new Set([...selectedPeople, ...resultKeys])])}
          >
            選取目前結果
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy || !resultKeys.some((key) => selectedSet.has(key))}
            onClick={() => changeSelection(selectedPeople.filter((key) => !resultKeySet.has(key)))}
          >
            取消選取目前結果
          </Button>
        </div>
      </div>
    </section>
  );
}
