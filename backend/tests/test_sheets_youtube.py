from backend.app.api.youtube import resolve_assignment_row
from backend.app.services.sheets_service import matches_team_person, normalize_text, team_option_label


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


def test_composite_keys_distinguish_same_names_and_team_rows():
    import json

    def key(team, kind, person):
        return "person:" + json.dumps([team, kind, person], ensure_ascii=False, separators=(",", ":"))

    named_a = {"所屬團體": "A", "人": "同名"}
    named_b = {"所屬團體": "B", "人": "同名"}
    whole_team = {"所屬團體": "A", "人": ""}
    named_like_team = {"所屬團體": "A", "人": "A（全隊）"}
    assert matches_team_person(named_a, "", key("A", "person", "同名"))
    assert not matches_team_person(named_b, "", key("A", "person", "同名"))
    assert matches_team_person(whole_team, "", key("A", "team", ""))
    assert not matches_team_person(named_like_team, "", key("A", "team", ""))
    assert matches_team_person(named_like_team, "", key("A", "person", "A（全隊）"))
    assert not matches_team_person(whole_team, "A", "person:broken")


def test_parse_options_returns_complete_deduplicated_identities_and_existing_aliases():
    from types import SimpleNamespace

    from backend.app.services.google_clients import google_client_context
    from backend.app.services.sheets_service import parse_options_from_sheets

    values = [
        ["所屬團體", "人", "別名", "團體別名"],
        ["A", "同名", "Alpha, 阿甲", "Team Alpha"],
        ["B", "同名", "Beta", ""],
        ["A", "", "", "A隊"],
        ["A", "同名", "AL", ""],
        ["", "獨立人物", "Solo", ""],
    ]
    request = SimpleNamespace(execute=lambda: {"values": values})
    service = SimpleNamespace(
        spreadsheets=lambda: SimpleNamespace(values=lambda: SimpleNamespace(get=lambda **_: request))
    )
    with google_client_context(lambda *_args, **_kwargs: service):
        result = parse_options_from_sheets(object(), "sheet", "工作表")
    assert result["teams"] == ["A", "B"]
    assert [(person["team"], person["kind"], person["person"]) for person in result["people"]] == [
        ("A", "person", "同名"),
        ("B", "person", "同名"),
        ("A", "team", ""),
        ("", "person", "獨立人物"),
    ]
    assert result["people"][0]["aliases"] == ["Alpha", "阿甲", "AL"]
    assert result["people"][0]["team_aliases"] == ["Team Alpha", "A隊"]
