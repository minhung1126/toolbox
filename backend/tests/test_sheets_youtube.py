from unittest.mock import MagicMock

from backend.app.api.youtube import resolve_assignment_row
from backend.app.services.sheets_service import (
    MAX_SHEET_ROWS,
    matches_team_person,
    normalize_text,
    read_sheet_data,
    team_option_label,
)


def test_sheet_matching_supports_unicode_and_whole_team(unicode_sheet_headers):
    team_header, person_header = unicode_sheet_headers
    row = {team_header: " A\u3000Team ", person_header: "\u200b"}
    assert normalize_text(row[team_header]) == "A Team"
    assert matches_team_person(row, "A Team", team_option_label("A Team"))


def test_duplicate_rows_only_pass_when_output_values_match():
    same = [{"title": "Title", "description": "Description"}, {"title": "Title", "description": "Description"}]
    conflict = [same[0], {"title": "Other", "description": "Description"}]
    assert resolve_assignment_row(same, "title", "description")[0] == same[0]
    assert resolve_assignment_row(conflict, "title", "description")[1] == "conflict"


def test_read_sheet_data_bounds_range_without_exclamation():
    mock_service = MagicMock()
    mock_get = mock_service.spreadsheets.return_value.values.return_value.get
    mock_get.return_value.execute.return_value = {
        "values": [
            ["Col1", "Col2"],
            ["Val1", "Val2"],
        ]
    }

    # Range without ! should be automatically bounded
    rows = read_sheet_data(mock_service, "test_id", "'Sheet1'")
    assert rows == [{"Col1": "Val1", "Col2": "Val2"}]
    mock_get.assert_called_with(
        spreadsheetId="test_id",
        range=f"'Sheet1'!1:{MAX_SHEET_ROWS + 2}",
    )

    # Range with ! should preserve specified range
    read_sheet_data(mock_service, "test_id", "'Sheet1'!A1:B10")
    mock_get.assert_called_with(
        spreadsheetId="test_id",
        range="'Sheet1'!A1:B10",
    )
